/**
 * Session de jeu : orchestre un tour de bout en bout (voir ARCHITECTURE.md §4).
 *
 *   action du joueur → Narrateur (flux) → scène enregistrée → Greffier → moteur de règles
 *   → mémoire → calendrier (→ cycle de nuit) → instantané → événements vers l'interface
 *
 * Principe de robustesse : l'état n'est remplacé qu'à la fin d'une étape réussie.
 * Un échec du Narrateur ne change rien ; un échec du Greffier laisse la scène jouée et rejouable.
 */
import type {
  BilanCouts, DemandeJet, EntreeJournalAppels, EvenementTour, GameState, Ligne, Notification, Preferences, Reglages, ResultatJet, SceneResume, StatId, Usage,
} from '@shared/types'
import { STATS } from '@shared/types'
import { ErreurFournisseur, versErreurIA, type FournisseurIA, type MessageIA, type BlocSysteme, type Role } from '@core/ai/types'
import {
  ChapitreSchema, lireChapitre, lireMonde, lireNuit, lirePlan, lireRapport, lireVerdict, MondeSchema, PlanSchema, RapportNuitSchema,
  RapportSceneSchema, VerdictSchema, RAPPORT_VIDE, sansAccents, type RapportScene,
} from '@core/ai/schemas'
import { AnalyseurFlux, analyserProse, proseLisible, type ProseAnalysee } from '@core/ai/prose'
import {
  AIDE_CHAPITRE, AIDE_MONDE, AIDE_NUIT, AIDE_PLAN, AIDE_RAPPORT, AIDE_VERDICT, bibleFixe, lienQualitatif, SYSTEME_CHAPITRE, SYSTEME_DEDUCTION,
  SYSTEME_EPILOGUE, SYSTEME_METTEUR, SYSTEME_MONDE, SYSTEME_NUIT, systemeGreffier,
} from '@core/ai/prompts/fr'
import { budgetFenetre, blocMemoire, compacter, construireNarrateur, ACTION_OUVERTURE, type SceneContexte } from '@core/memory/contexte'
import { decouper, retrouver, type Souvenir, type Vectoriseur } from '@core/memory/vecteurs'
import { appliquerChangements, appliquerDecouvertes, identifiant, incoherencesEvidentes, statutFaction, trouverParNom } from '@core/rules/moteur'
import { decrireResultat, lancer, NOMS_STATS, resoudre, validerDemande, valeurValide } from '@core/rules/des'
import {
  apresScene, avancer, configRythme, consigneCourante, creneauDe, creneauSuivant, dateLisible, jourSuivant, mystereAutorise, nouveauChapitre,
  planParDefaut, typeEffectif, type Avancee,
} from '@core/rules/rythme'
import { compteRendu, jouerTour, ouvrirCombat, type ActionCombat } from '@core/rules/combat'
import type { Regles } from '@core/rules/regles'
import type { Depot, SceneStockee } from '@core/storage/depot'
import { construireEtat, nouveauxSucces, validerHeros, type EntreeHeros, type PackUnivers } from './creation'

export interface Services {
  depot: Depot
  ia(): { grand: FournisseurIA; leger: FournisseurIA; modeleGrand: string; modeleLeger: string }
  reglages(): Reglages
  regles: Regles
  univers(id: string): PackUnivers | undefined
  vectoriseur(): Vectoriseur
  emettre(e: EvenementTour): void
  idSession: string
  journaliser?(e: Omit<EntreeJournalAppels, 'id'>): void
  /** Appelé après chaque scène appliquée : le service d'images prépare décors, sprites, illustrations. */
  apresScene?(etat: GameState, rapport: RapportScene, lignes: Ligne[]): void
  hasard?(): number
  maintenant?(): number
  identifiant?(): string
}

const MAX_NARRATION = { courte: 2500, moyenne: 3500, longue: 5000 }

function idAleatoire(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export class Session {
  etat: GameState
  readonly partieId: string
  private scenes: SceneStockee[] = []
  private souvenirs: Souvenir[] = []
  private occupe = false
  private controle: AbortController | null = null
  private dernierAppel = 0
  private ecartMoyen = 60_000
  /** Jet déjà lancé dont la narration a échoué : on ne le relance pas (pas de seconde chance gratuite). */
  private jetConserve: ResultatJet | null = null

  private constructor(private s: Services, partieId: string) {
    this.partieId = partieId
    this.etat = s.depot.etatCourant(partieId)
    this.recharger()
  }

  // ───────────────────────── Ouverture et création ─────────────────────────

  static ouvrir(s: Services, partieId: string): Session {
    if (!s.depot.partieExiste(partieId)) throw new Error('Cette partie n’existe plus.')
    return new Session(s, partieId)
  }

  /** Génère un monde neuf à partir des préférences, puis crée la partie. Ne joue pas encore la première scène. */
  static async creer(s: Services, preferences: Preferences, heros: EntreeHeros): Promise<Session> {
    const id = (s.identifiant ?? idAleatoire)()
    const h = validerHeros(heros)
    const univers = s.univers(preferences.univers)
    const { grand, modeleGrand } = s.ia()
    s.emettre({ type: 'phase', phase: 'monde' })
    const consigne = [
      `Univers : ${univers ? `${univers.nom} — ${univers.description}` : preferences.univers}`,
      `Ton souhaité : ${preferences.ton}`,
      `Point de départ : ${preferences.premisse || univers?.premisse || 'libre'}`,
      univers?.cadre ? `Cadre suggéré : ${univers.cadre}` : '',
      univers?.factions.length ? `Types de factions suggérés : ${univers.factions.join(' ; ')}` : '',
      univers?.archetypes.length ? `Archétypes d'héroïnes à subvertir (inspire-t'en librement) : ${univers.archetypes.join(' ; ')}` : '',
      `Le héros : ${h.prenom}, ${h.age} ans. Points forts : ${h.forces.map((f) => NOMS_STATS[f]).join(', ') || 'aucun en particulier'}${h.faiblesse ? ` ; point faible : ${NOMS_STATS[h.faiblesse]}` : ''}.`,
      preferences.envies ? `Le joueur aimerait : ${preferences.envies}` : '',
      preferences.refus ? `Le joueur ne veut PAS : ${preferences.refus}` : '',
      `Romance : ${preferences.romance ? 'possible, lente, à mériter' : 'désactivée (liens amicaux uniquement)'}. Violence : ${preferences.violence}.`,
      `Graine d'inspiration (pour varier d'une partie à l'autre) : ${id}`,
    ].filter(Boolean).join('\n')
    const debut = Date.now()
    try {
      const rep = await grand.structurer({
        role: 'monde', modele: modeleGrand, systeme: [{ texte: SYSTEME_MONDE }], messages: [{ role: 'user', contenu: consigne }],
        maxJetons: 14000, effort: s.reglages().ia.effort === 'low' ? 'medium' : s.reglages().ia.effort, schema: MondeSchema, aideFormat: AIDE_MONDE,
      })
      const monde = lireMonde(rep.donnees)
      if (monde.personnages.filter((p) => p.role === 'heroine').length < 2 || monde.factions.length < 2 || !monde.monde.veriteCachee) {
        throw new ErreurFournisseur('illisible', 'Le monde généré est incomplet. Réessayez (ou choisissez un modèle plus grand).', true, rep.brut.slice(0, 2000))
      }
      const etat = construireEtat({ id, preferences, heros: h, monde, univers, regles: s.regles })
      const quand = (s.maintenant ?? Date.now)()
      s.depot.creerPartie({ id, titre: monde.titre, univers: univers?.nom ?? preferences.univers, hero: h.prenom, etat, quand })
      s.depot.ajouterUsage(rep.usage, id, s.idSession, quand)
      s.journaliser?.({ quand, role: 'monde', fournisseur: grand.id, modele: modeleGrand, dureeMs: Date.now() - debut, prompt: consigne, reponse: rep.brut.slice(0, 20000), usage: rep.usage })
      return new Session(s, id)
    } finally {
      s.emettre({ type: 'phase', phase: 'repos' })
    }
  }

  private recharger(): void {
    this.scenes = this.s.depot.chemin(this.partieId)
    const ids = new Set(this.scenes.map((x) => x.id))
    this.souvenirs = this.s.depot.souvenirs(this.partieId, ids, this.s.vectoriseur().id)
  }

  // ───────────────────────── Lecture ─────────────────────────

  historique(): SceneResume[] {
    return this.scenes.map((x) => ({
      id: x.id, parent: x.parent, index: x.index, jour: x.jour, creneau: x.creneau, lieu: x.lieu, action: x.action, prose: proseLisible(x.prose),
      lignes: analyserProse(x.prose).lignes, creeLe: x.creeLe,
    }))
  }

  bilan(): BilanCouts {
    const c = this.s.reglages().couts
    return this.s.depot.bilan(this.partieId, this.s.idSession, { session: c.plafondSession, partie: c.plafondPartie })
  }

  get enCours(): boolean {
    return this.occupe
  }

  /** Le rapport de la dernière scène manque-t-il (échec du Greffier) ? */
  get rapportManquant(): boolean {
    const d = this.scenes[this.scenes.length - 1]
    return !!d && d.rapport === null && !this.etat.jetEnAttente
  }

  // ───────────────────────── Outils internes ─────────────────────────

  private maintenant(): number {
    return (this.s.maintenant ?? Date.now)()
  }

  private emettre(e: EvenementTour): void {
    this.s.emettre(e)
  }

  private erreur(e: unknown): void {
    this.emettre({ type: 'erreur', erreur: versErreurIA(e) })
  }

  /** Une seule opération à la fois ; l'interface est prévenue du début et de la fin. */
  private async exclusif(f: () => Promise<void>): Promise<void> {
    if (this.occupe) return
    this.occupe = true
    this.controle = new AbortController()
    try {
      await f()
    } catch (e) {
      this.erreur(e)
    } finally {
      this.occupe = false
      this.controle = null
      this.emettre({ type: 'phase', phase: 'repos' })
      this.emettre({ type: 'cout', bilan: this.bilan() })
    }
  }

  annuler(): void {
    this.controle?.abort()
  }

  private verifierPlafond(): void {
    const c = this.s.reglages().couts
    const session = this.s.depot.coutSession(this.s.idSession)
    const partie = this.s.depot.coutPartie(this.partieId)
    if (c.plafondSession > 0 && session >= c.plafondSession) {
      throw new ErreurFournisseur('plafond', `Plafond de dépense de la session atteint (${session.toFixed(2)} $). Vous pouvez le relever dans Réglages › Coûts.`, false)
    }
    if (c.plafondPartie > 0 && partie >= c.plafondPartie) {
      throw new ErreurFournisseur('plafond', `Plafond de dépense de cette partie atteint (${partie.toFixed(2)} $). Vous pouvez le relever dans Réglages › Coûts.`, false)
    }
  }

  private ttl(): '5m' | '1h' {
    const r = this.s.reglages().ia.cacheTtl
    if (r !== 'auto') return r
    // Si le joueur met en général plus de 4 minutes entre deux tours, le cache de 5 minutes expirerait à chaque fois.
    return this.ecartMoyen > 240_000 ? '1h' : '5m'
  }

  private noterEcart(): void {
    const t = this.maintenant()
    if (this.dernierAppel > 0) {
      const ecart = t - this.dernierAppel
      if (ecart < 2 * 3600_000) this.ecartMoyen = 0.6 * this.ecartMoyen + 0.4 * ecart
    }
    this.dernierAppel = t
  }

  private enregistrerAppel(role: Role, f: FournisseurIA, modele: string, debut: number, prompt: string, reponse: string, usage?: Usage, erreur?: string): void {
    const quand = this.maintenant()
    if (usage) this.s.depot.ajouterUsage(usage, this.partieId, this.s.idSession, quand)
    this.s.journaliser?.({ quand, role, fournisseur: f.id, modele, dureeMs: Date.now() - debut, prompt: prompt.slice(0, 80000), reponse: reponse.slice(0, 30000), usage, erreur })
  }

  private static aplatir(systeme: BlocSysteme[], messages: MessageIA[]): string {
    return `${systeme.map((b) => `[système]\n${b.texte}`).join('\n\n')}\n\n${messages.map((m) => `[${m.role}${m.cache ? ' · cache' : ''}]\n${m.contenu}`).join('\n\n')}`
  }

  private async texte(role: Role, taille: 'grand' | 'leger', systeme: BlocSysteme[], messages: MessageIA[], maxJetons: number, surDelta: (t: string) => void, meta?: Record<string, unknown>) {
    this.verifierPlafond()
    const ia = this.s.ia()
    const f = taille === 'grand' ? ia.grand : ia.leger
    const modele = taille === 'grand' ? ia.modeleGrand : ia.modeleLeger
    const debut = Date.now()
    const prompt = Session.aplatir(systeme, messages)
    try {
      const rep = await f.ecrire({ role, modele, systeme, messages, maxJetons, effort: this.s.reglages().ia.effort, ttl: this.ttl(), signal: this.controle?.signal, meta }, surDelta)
      this.enregistrerAppel(role, f, modele, debut, prompt, rep.texte, rep.usage)
      return rep
    } catch (e) {
      this.enregistrerAppel(role, f, modele, debut, prompt, '', undefined, e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  private async json(role: Role, taille: 'grand' | 'leger', systeme: BlocSysteme[], contenu: string, maxJetons: number, schema: import('zod').ZodType, aideFormat: string, meta?: Record<string, unknown>): Promise<unknown> {
    this.verifierPlafond()
    const ia = this.s.ia()
    const f = taille === 'grand' ? ia.grand : ia.leger
    const modele = taille === 'grand' ? ia.modeleGrand : ia.modeleLeger
    const messages: MessageIA[] = [{ role: 'user', contenu }]
    const debut = Date.now()
    const prompt = Session.aplatir(systeme, messages)
    try {
      // Les tâches de comptabilité n'ont pas besoin de réflexion poussée : effort bas, sauf pour la mise en scène.
      const effort = taille === 'grand' ? this.s.reglages().ia.effort : 'low'
      const rep = await f.structurer({ role, modele, systeme, messages, maxJetons, effort, ttl: this.ttl(), signal: this.controle?.signal, schema, aideFormat, meta })
      this.enregistrerAppel(role, f, modele, debut, prompt, rep.brut, rep.usage)
      return rep.donnees
    } catch (e) {
      this.enregistrerAppel(role, f, modele, debut, prompt, '', undefined, e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  private contexteScenes(): SceneContexte[] {
    return this.scenes.map((x) => ({ id: x.id, index: x.index, jour: x.jour, action: x.action, prose: x.prose }))
  }

  private evenementDuJour(etat: GameState): string | undefined {
    const u = this.s.univers(etat.preferences.univers)
    const e = u?.evenements.find((x) => x.jour === etat.calendrier.jour)
    return e ? `${e.nom} — ${e.description}` : undefined
  }

  private emploi(etat: GameState) {
    return this.s.univers(etat.preferences.univers)?.emploiDuTemps ?? {}
  }

  private presentsRecents(): string[] {
    for (let i = this.scenes.length - 1; i >= 0 && i >= this.scenes.length - 2; i--) {
      const r = this.scenes[i].rapport as RapportScene | null
      if (r?.presents?.length) return r.presents
    }
    return []
  }

  private async rappeler(etat: GameState, action: string): Promise<string[]> {
    const debut = Math.min(etat.memoire.debutFenetre, this.scenes.length)
    if (debut === 0 || !this.souvenirs.length) return []
    try {
      const dernier = etat.memoire.scenes[etat.memoire.scenes.length - 1]?.texte ?? ''
      const [v] = await this.s.vectoriseur().vectoriser([`${action}\n${dernier}`])
      const k = this.s.ia().grand.gabarit === 'petit' ? 2 : 4
      return retrouver(v, this.souvenirs, k, debut).map((x) => `(jour ${x.jour}) ${x.texte.slice(0, 600)}`)
    } catch {
      return []
    }
  }

  private async indexer(scene: SceneStockee): Promise<void> {
    try {
      const v = this.s.vectoriseur()
      const passages = decouper(proseLisible(scene.prose))
      if (scene.action && scene.action !== ACTION_OUVERTURE) passages.unshift(`Le héros : ${scene.action}`)
      const vecteurs = await v.vectoriser(passages)
      const items = passages.map((texte, i) => ({ texte, vecteur: vecteurs[i] }))
      this.s.depot.ajouterSouvenirs(this.partieId, scene.id, scene.index, scene.jour, items, v.id)
      for (const it of items) this.souvenirs.push({ sceneId: scene.id, indexScene: scene.index, jour: scene.jour, texte: it.texte, vecteur: it.vecteur })
    } catch {
      /* L'indexation est un confort : son échec ne doit jamais bloquer le jeu. */
    }
  }

  // ───────────────────────── Tour de jeu ─────────────────────────

  /** Première scène d'une partie neuve (ou reprise d'une partie restée sans scène). */
  async commencer(): Promise<void> {
    if (this.scenes.length > 0) return
    await this.exclusif(() => this.tour(this.etat, ''))
  }

  /** Le joueur écrit ce que fait son personnage. `activite` : action de temps libre aux effets déterministes. */
  async jouer(texte: string, activite?: string): Promise<void> {
    const action = texte.replace(/\[\[|\]\]/g, '').trim().slice(0, 2000)
    if (!action) return
    if (this.etat.termine) return this.erreur(new ErreurFournisseur('inconnu', 'Cette histoire est terminée.', false))
    if (this.etat.jetEnAttente) return this.erreur(new ErreurFournisseur('inconnu', 'Un jet de dé est en attente : lancez d’abord le dé.', false))
    if (this.etat.combat?.actif) return this.erreur(new ErreurFournisseur('inconnu', 'Un combat est en cours.', false))
    await this.exclusif(async () => {
      const depart = structuredClone(this.etat)
      depart.stats.motsEcrits += action.split(/\s+/).length
      const notes = activite ? this.appliquerActivite(depart, activite) : []
      await this.tour(depart, action)
      if (notes.length) this.emettre({ type: 'notifications', liste: notes })
    })
  }

  /** Effets garantis par les règles pour les activités de temps libre. */
  private appliquerActivite(etat: GameState, activite: string): Notification[] {
    const notes: Notification[] = []
    const [genre, cible] = activite.split(':')
    const r = this.s.regles.heros
    if (genre === 'entrainement' && (STATS as readonly string[]).includes(cible)) {
      const stat = cible as StatId
      const n = (etat.entrainement[stat] ?? 0) + 1
      if (n >= r.entrainementsParPoint && etat.hero.stats[stat] < r.statMax) {
        etat.hero.stats[stat] += 1
        etat.entrainement[stat] = 0
        notes.push({ genre: 'info', texte: `${NOMS_STATS[stat]} +1 (entraînement)`, delta: 1 })
      } else {
        etat.entrainement[stat] = n
        notes.push({ genre: 'info', texte: `Entraînement : ${NOMS_STATS[stat]} (${n}/${r.entrainementsParPoint})` })
      }
    } else if (genre === 'repos') {
      const pv = Math.min(etat.hero.pvMax, etat.hero.pv + Math.ceil(etat.hero.pvMax * 0.3))
      if (pv !== etat.hero.pv) notes.push({ genre: 'pv', texte: `PV +${pv - etat.hero.pv} (repos)`, delta: pv - etat.hero.pv })
      etat.hero.pv = pv
      etat.hero.mana = etat.hero.manaMax
      etat.hero.etats = etat.hero.etats.filter((e) => !/fatigu|épuis|epuis/i.test(e))
    }
    return notes
  }

  /** Lancer de dé : `valeur` saisie par le joueur (dés réels), ou null pour un lancer virtuel. */
  async lancerDe(valeur: number | null): Promise<void> {
    const demande = this.etat.jetEnAttente
    if (!demande) return
    if (valeur !== null && !valeurValide(demande.de, valeur)) {
      return this.erreur(new ErreurFournisseur('inconnu', `Résultat impossible pour un ${demande.de}.`, false))
    }
    await this.exclusif(async () => {
      const resultat = this.jetConserve ?? resoudre(demande, valeur ?? lancer(demande.de, this.s.hasard), this.etat.hero, valeur === null)
      this.jetConserve = resultat
      const depart = structuredClone(this.etat)
      depart.jetEnAttente = null
      depart.dernierJet = resultat
      depart.stats.jets += 1
      if (resultat.reussite) depart.stats.jetsReussis += 1
      if (resultat.critique) depart.stats.critiques += 1
      this.emettre({ type: 'jet-resultat', resultat })
      const phrase = decrireResultat(resultat, NOMS_STATS[resultat.stat])
      await this.tour(depart, `[Jet de dé] ${phrase}`, phrase)
      this.jetConserve = null
    })
  }

  /** Rejoue l'étape qui a échoué : narration (avec le jet déjà lancé s'il y en a un), rapport, ou première scène. */
  async reessayer(): Promise<void> {
    if (this.etat.jetEnAttente && this.jetConserve) await this.lancerDe(null)
    else if (this.rapportManquant) await this.exclusif(() => this.cloturer(this.etat))
    else if (this.scenes.length === 0) await this.commencer()
  }

  private async tour(depart: GameState, action: string, resultatJet?: string): Promise<void> {
    this.noterEcart()
    const reglages = this.s.reglages()
    const { grand } = this.s.ia()
    const souvenirs = await this.rappeler(depart, action)
    const ctx = construireNarrateur({
      etat: depart, scenes: this.contexteScenes(), action, reglages, regles: this.s.regles, gabarit: grand.gabarit,
      souvenirs, evenementDuJour: this.evenementDuJour(depart), resultatJet, presentsRecents: this.presentsRecents(),
    })
    this.emettre({ type: 'phase', phase: 'narration' })
    const flux = new AnalyseurFlux()
    const rep = await this.texte('narrateur', 'grand', ctx.systeme, ctx.messages, MAX_NARRATION[reglages.ia.longueurScene] ?? 3500, (d) => {
      for (const ligne of flux.pousser(d)) this.emettre({ type: 'ligne', ligne })
      this.emettre({ type: 'delta', texte: flux.enCours })
    }, { index: this.scenes.length, jour: depart.calendrier.jour })
    for (const ligne of flux.terminer()) this.emettre({ type: 'ligne', ligne })
    this.emettre({ type: 'delta', texte: '' })

    const analyse = analyserProse(rep.texte)
    if (!analyse.lignes.some((l) => l.type !== 'lieu')) {
      throw new ErreurFournisseur('illisible', 'Le Narrateur n’a rien écrit d’exploitable. Vous pouvez réessayer.', true, rep.texte.slice(0, 500))
    }

    const etat = structuredClone(depart)
    etat.memoire.correction = undefined
    if (analyse.lieu) this.entrerDansLieu(etat, analyse.lieu)
    const jet = analyse.jet ? validerDemande(analyse.jet, etat.preferences, this.s.regles) : null
    etat.jetEnAttente = jet
    if (jet) etat.pistes = []

    const parent = this.scenes[this.scenes.length - 1]
    const scene: SceneStockee = {
      id: `${this.partieId}:${(this.s.identifiant ?? idAleatoire)()}`, parent: parent?.id ?? null, index: (parent?.index ?? -1) + 1,
      jour: etat.calendrier.jour, creneau: etat.calendrier.creneau, lieu: etat.lieux.find((l) => l.id === etat.lieuActuel)?.nom ?? '',
      action, prose: rep.texte, rapport: null, marque: null, creeLe: this.maintenant(),
    }
    this.s.depot.ajouterScene({ ...scene, partie: this.partieId, etat, quand: scene.creeLe })
    this.scenes.push(scene)
    this.etat = etat
    this.emettre({ type: 'scene-finie', sceneId: scene.id })
    void this.indexer(scene)

    if (jet) {
      this.emettre({ type: 'etat', etat })
      this.emettre({ type: 'jet', demande: jet })
      return
    }
    await this.cloturer(etat, analyse)
  }

  private entrerDansLieu(etat: GameState, nom: string): void {
    let lieu = trouverParNom(etat.lieux, nom)
    if (!lieu && etat.lieux.length < 60) {
      lieu = { id: identifiant('l', nom, etat.lieux), nom: nom.slice(0, 60), description: '', type: 'salle', decouvert: true }
      etat.lieux.push(lieu)
    }
    if (lieu) {
      lieu.decouvert = true
      etat.lieuActuel = lieu.id
    }
  }

  /**
   * Après la narration : rapport du Greffier, moteur de règles, mémoire, calendrier, instantané.
   * Si le Greffier échoue, la scène reste jouée ; le joueur peut relancer le rapport ou simplement continuer.
   */
  private async cloturer(depart: GameState, analyse?: ProseAnalysee): Promise<void> {
    const scene = this.scenes[this.scenes.length - 1]
    if (!scene) return
    analyse ??= analyserProse(scene.prose)
    const reglages = this.s.reglages()
    this.emettre({ type: 'phase', phase: 'rapport' })

    let rapport: RapportScene = RAPPORT_VIDE
    try {
      rapport = lireRapport(await this.json('greffier', 'leger', [{ texte: systemeGreffier(this.s.ia().leger.gabarit), cache: true }],
        this.consigneGreffier(depart, scene), 3000, RapportSceneSchema, AIDE_RAPPORT, { index: scene.index, jour: depart.calendrier.jour }))
    } catch (e) {
      const err = versErreurIA(e)
      if (err.genre === 'annule') throw e
      this.emettre({ type: 'erreur', erreur: { ...err, message: `La scène est enregistrée, mais son rapport a échoué : fiche, liens et journal n’ont pas été mis à jour. ${err.message}`, reessayable: true } })
      return
    }

    // 1. Moteur de règles : l'IA propose, le code borne.
    const chiffres = appliquerChangements(depart, rapport.changements, this.s.regles)
    const decouvertes = appliquerDecouvertes(chiffres.etat, rapport)
    const etat = decouvertes.etat
    const notes: Notification[] = [...chiffres.notifications, ...decouvertes.notifications]

    // 2. Mémoire.
    const m = etat.memoire
    m.scenes.push({ sceneId: scene.id, jour: scene.jour, texte: rapport.resume || proseLisible(scene.prose).slice(0, 240) })
    for (const f of rapport.faits) if (!m.faits.some((x) => sansAccents(x) === sansAccents(f))) m.faits.push(f.slice(0, 240))
    if (m.faits.length > 150) { const retire = m.faits.length - 150; m.faits.splice(0, retire); m.faitsStables = Math.max(0, m.faitsStables - retire) }
    for (const p of rapport.promesses) if (!m.promesses.some((x) => sansAccents(x.texte) === sansAccents(p))) m.promesses.push({ texte: p.slice(0, 200), tenue: false })
    if (m.promesses.length > 30) m.promesses.splice(0, m.promesses.length - 30)
    // Les événements hors champ ont eu une scène pour se manifester : on les considère montrés après deux jours.
    for (const h of m.horsChamp) if (!h.revele && etat.calendrier.jour - h.jour >= 2) h.revele = true

    // 3. Gardien de la cohérence : garde-fous gratuits, puis remarque du Greffier.
    const problemes = incoherencesEvidentes(etat, analyse.locuteurs)
    if (reglages.ia.gardien !== 'off' && rapport.incoherence) problemes.push(rapport.incoherence)
    if (problemes.length) {
      m.correction = problemes.join(' ').slice(0, 400)
      if (reglages.ia.gardien === 'strict') notes.push({ genre: 'info', texte: `Le Gardien a relevé une incohérence : ${m.correction} Vous pouvez faire réécrire la scène (menu Sauvegardes).` })
    }

    // 4. Rythme, statistiques, pistes.
    const horsBudget = rapport.indiceRevele && !mystereAutorise(depart, this.s.regles) && consigneCourante(depart, this.s.regles).type !== 'mystere'
    etat.rythme = apresScene(etat.rythme, rapport.indiceRevele)
    if (horsBudget) m.correction = `${m.correction ?? ''} Le mystère a trop affleuré : reviens au quotidien pour un long moment.`.trim()
    etat.stats.scenes += 1
    etat.pistes = rapport.pistes.slice(0, 3)

    // 5. Illustration et combat.
    if (rapport.momentFort && reglages.images.illustrations && etat.galerie.length < 60) {
      etat.galerie.push({ id: `cg-${scene.id.split(':').pop()}`, titre: rapport.momentFort.titre.slice(0, 80), jour: scene.jour, humeur: rapport.humeur })
      notes.push({ genre: 'info', texte: `Illustration débloquée : ${rapport.momentFort.titre}` })
    }
    if (rapport.combat?.ennemis.length) {
      etat.combat = ouvrirCombat(etat, rapport.combat.enjeu, rapport.combat.ennemis, rapport.presents)
      etat.pistes = []
    }

    // 6. Calendrier ; si la journée se termine, cycle de nuit.
    let avancee: Avancee = { calendrier: etat.calendrier, nouveauCreneau: false, nouveauJour: false, nouveauChapitre: false }
    if (!etat.combat) {
      avancee = avancer(etat.calendrier, rapport.finCreneau, this.s.regles)
      etat.calendrier = avancee.calendrier
    }
    scene.rapport = rapport
    let final = etat
    if (avancee.nouveauJour) final = await this.cycleDeNuit(etat, avancee.nouveauChapitre)
    else this.compacterSiBesoin(final, false)

    // 7. Succès, instantané, événements.
    for (const sx of nouveauxSucces(final)) {
      final.succes.push(sx.id)
      notes.push({ genre: 'succes', texte: `Succès : ${sx.nom}` })
    }
    this.s.depot.majScene(scene.id, { etat: final, rapport })
    this.etat = final
    this.emettre({ type: 'etat', etat: final })
    if (notes.length) this.emettre({ type: 'notifications', liste: notes })
    if (chiffres.refus.length) this.s.journaliser?.({ quand: this.maintenant(), role: 'moteur', fournisseur: 'regles', modele: '', dureeMs: 0, prompt: 'Propositions refusées ou rabotées', reponse: chiffres.refus.join('\n') })
    this.emettre({ type: 'ambiance', humeur: rapport.humeur, effet: rapport.effet === 'aucun' ? null : rapport.effet, meteo: rapport.meteo === 'aucune' ? null : rapport.meteo })
    this.s.apresScene?.(final, rapport, analyse.lignes)
  }

  private consigneGreffier(etat: GameState, scene: SceneStockee): string {
    // Une scène suspendue à un jet n'a pas eu de rapport : on la joint à celle-ci.
    const precedentes: SceneStockee[] = []
    for (let i = this.scenes.length - 2; i >= 0 && precedentes.length < 2; i--) {
      if (this.scenes[i].rapport !== null) break
      precedentes.unshift(this.scenes[i])
    }
    const heroines = etat.personnages.filter((p) => p.role === 'heroine').map((p) => p.nom)
    const autres = etat.personnages.filter((p) => p.role !== 'heroine').map((p) => p.nom)
    const objectifs = etat.journal.filter((j) => j.type === 'objectif' && j.statut === 'actif').map((j) => j.texte)
    const parties = [
      `Noms connus — héroïnes : ${heroines.join(', ') || 'aucune'} ; autres personnages : ${autres.join(', ') || 'aucun'} ; factions : ${etat.factions.map((f) => f.nom).join(', ')} ; lieux : ${etat.lieux.map((l) => l.nom).join(', ')}.`,
      `Héros : ${etat.hero.prenom}. Possède : ${etat.hero.inventaire.map((o) => o.nom).join(', ') || 'rien de notable'}. Bourse : ${etat.hero.or} pièce(s). États : ${etat.hero.etats.join(', ') || 'aucun'}.`,
      objectifs.length ? `Objectifs en cours : ${objectifs.join(' ; ')}` : '',
      etat.memoire.faits.length ? `Faits établis :\n${etat.memoire.faits.slice(-30).map((f) => `- ${f}`).join('\n')}` : '',
      etat.personnages.some((p) => p.statut === 'mort') ? `Personnages morts : ${etat.personnages.filter((p) => p.statut === 'mort').map((p) => p.nom).join(', ')}` : '',
      `Moment : ${dateLisible(etat.calendrier)}.`,
      ...precedentes.map((p) => `[SCÈNE PRÉCÉDENTE, suspendue à un jet de dé]\n${p.prose}`),
      `[ACTION DU JOUEUR — ce qu'il tente ou affirme ; seul le récit fait foi]\n${scene.action || ACTION_OUVERTURE}`,
      `[SCÈNE À RAPPORTER]\n${scene.prose}`,
    ]
    return parties.filter(Boolean).join('\n\n')
  }

  private compacterSiBesoin(etat: GameState, finDeJournee: boolean): void {
    const budget = budgetFenetre(this.s.reglages(), this.s.ia().grand.gabarit)
    const c = compacter(etat, this.contexteScenes(), budget, finDeJournee)
    if (c) {
      etat.memoire.debutFenetre = c.debutFenetre
      etat.memoire.faitsStables = c.faitsStables
    }
  }

  // ───────────────────────── Cycle de nuit ─────────────────────────

  /**
   * Entre deux journées : les personnages agissent hors champ, la journée est résumée,
   * le chapitre est éventuellement clos, et le Metteur en scène planifie le lendemain.
   * Chaque étape a un repli : la nuit ne bloque jamais la partie.
   */
  private async cycleDeNuit(source: GameState, finChapitre: boolean): Promise<GameState> {
    const etat = structuredClone(source)
    const hier = etat.calendrier.jour - 1
    this.emettre({ type: 'transition', titre: `Jour ${etat.calendrier.jour}`, sousTitre: 'La nuit passe…' })
    this.emettre({ type: 'phase', phase: 'nuit' })
    const scenesDuJour = etat.memoire.scenes.filter((x) => x.jour === hier)

    // 1. Agents de personnages + résumé du jour (un seul appel léger).
    try {
      const fiches = etat.personnages.filter((p) => p.statut === 'vivant' && (p.role !== 'secondaire' || p.rencontre)).slice(0, 12).map((p) =>
        `- ${p.nom} (${p.archetype || p.role}) — veut : ${p.objectifs.join(' ; ') || '?'} ; secrets : ${p.secrets.join(' ; ') || 'aucun'} ; pense du héros : ${p.opinion || 'rien encore'}${p.role === 'heroine' ? ` ; lien : ${lienQualitatif(p.resonance)}` : ''} ; arc : ${p.arc.etapes[p.arc.etape] ?? 'aucun'} ; souvenirs du jour : ${p.souvenirs.filter((x) => x.startsWith(`J${hier} `)).join(' | ') || 'aucun'}`).join('\n')
      const consigne = [
        `Monde : ${etat.monde.nom}. ${etat.monde.cadre}`,
        `Vérité cachée (pour la cohérence des agissements) : ${etat.monde.veriteCachee}`,
        `Journée écoulée (jour ${hier}) :\n${scenesDuJour.map((x) => `- ${x.texte}`).join('\n') || '- Une journée sans histoire.'}`,
        `Personnages :\n${fiches}`,
      ].join('\n\n')
      const nuit = lireNuit(await this.json('nuit', 'leger', [{ texte: SYSTEME_NUIT, cache: true }], consigne, 2500, RapportNuitSchema, AIDE_NUIT, { jour: hier }))
      if (nuit.resumeJour) etat.memoire.jours.push({ jour: hier, texte: nuit.resumeJour })
      for (const h of nuit.horsChamp) {
        etat.memoire.horsChamp.push({ jour: hier, personnage: h.personnage, texte: `${h.action}${h.consequence ? ` → visible : ${h.consequence}` : ''}`.slice(0, 400), revele: false })
      }
      if (etat.memoire.horsChamp.length > 24) etat.memoire.horsChamp.splice(0, etat.memoire.horsChamp.length - 24)
      for (const o of nuit.opinions) {
        const p = trouverParNom(etat.personnages, o.personnage)
        if (p) p.opinion = o.opinion.slice(0, 300)
      }
      for (const a of nuit.arcs) {
        const p = trouverParNom(etat.personnages, a.personnage)
        if (p && a.avance && p.arc.etape < p.arc.etapes.length - 1) p.arc.etape += 1
      }
    } catch (e) {
      if (versErreurIA(e).genre === 'annule') throw e
    }
    if (!etat.memoire.jours.some((j) => j.jour === hier)) {
      etat.memoire.jours.push({ jour: hier, texte: scenesDuJour.map((x) => x.texte).join(' ').slice(0, 900) || 'Une journée sans histoire.' })
    }

    // 2. Fin de chapitre : résumé de chapitre et chronique.
    if (finChapitre) {
      const chapitre = etat.rythme.chapitre
      const joursDuChapitre = etat.memoire.jours
      try {
        const consigne = `Chronique actuelle :\n${etat.memoire.chronique || '(vide : c’est le premier chapitre)'}\n\nJournées du chapitre ${chapitre} :\n${joursDuChapitre.map((j) => `Jour ${j.jour} — ${j.texte}`).join('\n')}`
        const c = lireChapitre(await this.json('chapitre', 'leger', [{ texte: SYSTEME_CHAPITRE }], consigne, 2500, ChapitreSchema, AIDE_CHAPITRE))
        if (c.resumeChapitre) {
          etat.memoire.chapitres.push({ chapitre, texte: c.resumeChapitre })
          if (c.chronique) etat.memoire.chronique = c.chronique
          etat.memoire.jours = []
        }
      } catch (e) {
        if (versErreurIA(e).genre === 'annule') throw e
      }
      etat.rythme = nouveauChapitre(etat.rythme, etat, this.s.regles)
      this.emettre({ type: 'transition', titre: `Chapitre ${etat.rythme.chapitre}`, sousTitre: `Jour ${etat.calendrier.jour}` })
    }

    // 3. Le héros a dormi.
    etat.hero.pv = Math.min(etat.hero.pvMax, etat.hero.pv + Math.ceil(etat.hero.pvMax * 0.25))
    etat.hero.mana = etat.hero.manaMax
    etat.hero.etats = etat.hero.etats.filter((e) => !/fatigu|inconscient|étourdi|etourdi/i.test(e))

    // 4. Metteur en scène : plan du lendemain, plafonné par le budget de mystère.
    this.emettre({ type: 'phase', phase: 'plan' })
    etat.plan = planParDefaut(etat.calendrier.jour, this.emploi(etat))
    try {
      const plan = lirePlan(await this.json('metteur-en-scene', 'grand', [{ texte: SYSTEME_METTEUR, cache: true }], this.consigneMetteur(etat), 2500, PlanSchema, AIDE_PLAN, { jour: etat.calendrier.jour }))
      if (plan.consignes.length) {
        etat.plan = {
          jour: etat.calendrier.jour,
          intention: plan.intention,
          consignes: plan.consignes.map((c) => ({ ...c, type: typeEffectif(c.type, etat, this.s.regles) })),
        }
        etat.rythme.tension = plan.tension
        if (plan.finDeLHistoire && etat.rythme.chapitre >= Math.max(2, etat.monde.actes.length)) etat.finProposee = true
      }
    } catch (e) {
      if (versErreurIA(e).genre === 'annule') throw e
    }

    this.compacterSiBesoin(etat, true)
    return etat
  }

  private consigneMetteur(etat: GameState): string {
    const cfg = configRythme(etat, this.s.regles)
    const autorise = mystereAutorise(etat, this.s.regles)
    const liens = etat.personnages.filter((p) => p.role === 'heroine').map((p) => `${p.nom} : ${p.rencontre ? lienQualitatif(p.resonance) : 'pas encore rencontrée'} — arc « ${p.arc.titre} », étape : ${p.arc.etapes[p.arc.etape] ?? '—'}`)
    const emploi = this.emploi(etat)
    const evenement = this.evenementDuJour(etat)
    const acte = Math.min(etat.monde.actes.length, etat.rythme.chapitre)
    return [
      `Histoire : ${etat.monde.titre} — ${etat.monde.nom}. ${etat.monde.cadre}`,
      `Actes prévus :\n${etat.monde.actes.map((a, i) => `${i + 1}. ${a.titre} — ${a.resume}`).join('\n')}`,
      `Nous sommes au chapitre ${etat.rythme.chapitre} (acte ${acte} environ), jour ${etat.calendrier.jour}${(etat.calendrier.jour - 1) % 7 >= 5 ? ' — jour de repos, sans cours' : ''}.`,
      etat.memoire.chronique ? `Chronique :\n${etat.memoire.chronique}` : '',
      etat.memoire.jours.length ? `Journées récentes :\n${etat.memoire.jours.slice(-4).map((j) => `Jour ${j.jour} — ${j.texte}`).join('\n')}` : '',
      `Liens du héros :\n${liens.join('\n')}`,
      etat.memoire.horsChamp.filter((h) => !h.revele).length ? `Hors champ (conséquences à faire apparaître) :\n${etat.memoire.horsChamp.filter((h) => !h.revele).slice(-5).map((h) => `- ${h.personnage} : ${h.texte}`).join('\n')}` : '',
      etat.memoire.promesses.filter((p) => !p.tenue).length ? `Promesses et rendez-vous en suspens :\n${etat.memoire.promesses.filter((p) => !p.tenue).slice(-5).map((p) => `- ${p.texte}`).join('\n')}` : '',
      `Factions : ${etat.factions.map((f) => `${f.nom} (${statutFaction(f, this.s.regles)})`).join(', ')}.`,
      Object.keys(emploi).length ? `Emploi du temps habituel : ${Object.entries(emploi).map(([k, v]) => `${k} : ${v}`).join(' ; ')}.` : '',
      evenement ? `Événement prévu demain : ${evenement}` : '',
      `Vérité cachée : ${etat.monde.veriteCachee}`,
      `BUDGET DE MYSTÈRE — ${autorise ? `une scène de type "mystere" est permise demain (une seule ; indices restants dans ce chapitre : ${etat.rythme.indicesRestants})` : `AUCUNE scène de type "mystere" demain (il faut encore ${Math.max(cfg.debutSansMystere - etat.rythme.totalScenes, cfg.ecartMin - etat.rythme.scenesDepuisIndice, 1)} scène(s) de quotidien, ou le budget du chapitre est épuisé)`}.`,
      etat.preferences.envies ? `Le joueur aimerait : ${etat.preferences.envies}` : '',
      etat.preferences.refus ? `Le joueur ne veut pas : ${etat.preferences.refus}` : '',
    ].filter(Boolean).join('\n\n')
  }

  // ───────────────────────── Temps ─────────────────────────

  /** Le joueur choisit de laisser filer le créneau, ou d'aller dormir. Aucun appel au Narrateur. */
  async avancerTemps(mode: 'creneau' | 'jour'): Promise<void> {
    if (this.etat.jetEnAttente || this.etat.combat?.actif || this.etat.termine || this.scenes.length === 0) return
    await this.exclusif(async () => {
      let etat = structuredClone(this.etat)
      const a = mode === 'jour' ? jourSuivant(etat.calendrier, this.s.regles) : creneauSuivant(etat.calendrier, this.s.regles)
      etat.calendrier = a.calendrier
      etat.pistes = []
      if (a.nouveauJour) etat = await this.cycleDeNuit(etat, a.nouveauChapitre)
      else this.emettre({ type: 'transition', titre: dateLisible(etat.calendrier).split(' · ').pop() ?? '', sousTitre: `Jour ${etat.calendrier.jour}` })
      const notes: Notification[] = []
      for (const sx of nouveauxSucces(etat)) { etat.succes.push(sx.id); notes.push({ genre: 'succes', texte: `Succès : ${sx.nom}` }) }
      this.persisterEtat(etat)
      if (notes.length) this.emettre({ type: 'notifications', liste: notes })
    })
  }

  // ───────────────────────── Combat ─────────────────────────

  async actionCombat(action: ActionCombat, d20: number | null): Promise<void> {
    if (!this.etat.combat?.actif) return
    if (d20 !== null && !valeurValide('D20', d20)) return this.erreur(new ErreurFournisseur('inconnu', 'Résultat impossible pour un D20.', false))
    await this.exclusif(async () => {
      const v = d20 ?? lancer('D20', this.s.hasard)
      const graine = Math.floor((this.s.hasard ?? Math.random)() * 1e9)
      const { etat, notifications } = jouerTour(this.etat, action, v, graine)
      const tete = this.scenes[this.scenes.length - 1]
      this.s.depot.majScene(tete.id, { etat })
      this.etat = etat
      this.emettre({ type: 'etat', etat })
      if (notifications.length) this.emettre({ type: 'notifications', liste: notifications })
      if (etat.combat && !etat.combat.actif) {
        // Le combat est tranché par les règles ; le Narrateur raconte la suite.
        const recit = compteRendu(etat.combat)
        const depart = structuredClone(etat)
        depart.combat = null
        await this.tour(depart, recit)
      }
    })
  }

  // ───────────────────────── Enquête ─────────────────────────

  async deduire(idsIndices: string[], hypothese: string): Promise<void> {
    const texte = hypothese.trim().slice(0, 800)
    const indices = this.etat.journal.filter((j) => idsIndices.includes(j.id))
    if (!texte || indices.length < 2) return this.erreur(new ErreurFournisseur('inconnu', 'Reliez au moins deux indices et formulez une hypothèse.', false))
    await this.exclusif(async () => {
      this.emettre({ type: 'phase', phase: 'deduction' })
      const consigne = `Vérité cachée : ${this.etat.monde.veriteCachee}\n\nIndices reliés par le joueur :\n${indices.map((i) => `- ${i.texte}`).join('\n')}\n\nHypothèse du joueur : ${texte}`
      const v = lireVerdict(await this.json('deduction', 'leger', [{ texte: SYSTEME_DEDUCTION }], consigne, 1200, VerdictSchema, AIDE_VERDICT))
      const etat = structuredClone(this.etat)
      etat.hypotheses.push({ id: `h${etat.hypotheses.length + 1}`, indices: indices.map((i) => i.id), texte, verdict: v.verdict, commentaire: v.commentaire, jour: etat.calendrier.jour })
      const notes: Notification[] = [{ genre: 'info', texte: v.verdict === 'juste' ? 'Déduction juste.' : v.verdict === 'partielle' ? 'Déduction partiellement juste.' : 'Cette hypothèse ne tient pas.' }]
      if (v.verdict === 'juste') {
        etat.stats.deductionsJustes += 1
        // Une bonne déduction fait avancer l'histoire : elle rouvre le budget de mystère et devient un fait.
        const cfg = configRythme(etat, this.s.regles)
        etat.rythme.indicesRestants = Math.max(1, etat.rythme.indicesRestants + 1)
        etat.rythme.scenesDepuisIndice = Math.max(etat.rythme.scenesDepuisIndice, cfg.ecartMin)
        etat.memoire.faits.push(`Le héros a compris ceci : ${texte.slice(0, 200)}`)
        if (v.consequence) etat.journal.push({ id: `j${etat.journal.length + 1}-${etat.calendrier.jour}`, type: 'objectif', texte: v.consequence.slice(0, 300), statut: 'actif', jour: etat.calendrier.jour })
      }
      for (const sx of nouveauxSucces(etat)) { etat.succes.push(sx.id); notes.push({ genre: 'succes', texte: `Succès : ${sx.nom}` }) }
      this.persisterEtat(etat)
      this.emettre({ type: 'notifications', liste: notes })
    })
  }

  private persisterEtat(etat: GameState): void {
    const tete = this.scenes[this.scenes.length - 1]
    if (tete) this.s.depot.majScene(tete.id, { etat })
    else this.s.depot.majEtatInitial(this.partieId, etat)
    this.etat = etat
    this.emettre({ type: 'etat', etat })
  }

  // ───────────────────────── Arbre des sauvegardes ─────────────────────────

  /** Revient à une scène passée. Continuer à jouer depuis là crée une nouvelle branche. */
  revenirA(sceneId: string | null): void {
    if (this.occupe) return
    this.s.depot.definirTete(this.partieId, sceneId, this.maintenant())
    this.etat = this.s.depot.etatCourant(this.partieId)
    this.recharger()
    this.emettre({ type: 'etat', etat: this.etat })
  }

  /** Fait réécrire la dernière scène : on revient juste avant et on rejoue la même action (nouvelle branche). */
  async refaire(): Promise<void> {
    const derniere = this.scenes[this.scenes.length - 1]
    if (!derniere || this.occupe) return
    const action = derniere.action
    this.revenirA(derniere.parent)
    if (this.etat.jetEnAttente && action.startsWith('[Jet de dé]')) return
    if (!action) await this.commencer()
    else await this.exclusif(() => this.tour(structuredClone(this.etat), action))
  }

  marquer(sceneId: string, marque: string | null): void {
    this.s.depot.majScene(sceneId, { marque: marque ? marque.slice(0, 60) : null })
  }

  sauvegardeRapide(): void {
    const tete = this.scenes[this.scenes.length - 1]
    if (tete) this.marquer(tete.id, `Sauvegarde rapide — ${dateLisible(this.etat.calendrier)}`)
  }

  // ───────────────────────── Épilogue ─────────────────────────

  async conclure(): Promise<void> {
    if (this.etat.termine || this.scenes.length === 0) return
    await this.exclusif(async () => {
      this.emettre({ type: 'phase', phase: 'epilogue' })
      const e = this.etat
      const liens = e.personnages.filter((p) => p.rencontre).map((p) => `- ${p.nom} : ${p.role === 'heroine' ? lienQualitatif(p.resonance) : p.role}${p.moments.length ? ` ; moments : ${p.moments.slice(-3).map((m) => m.texte).join(' | ')}` : ''}${p.opinion ? ` ; pense de lui : ${p.opinion}` : ''}`).join('\n')
      const contenu = [
        blocMemoire(e, this.contexteScenes()),
        e.memoire.jours.length ? `Dernières journées :\n${e.memoire.jours.slice(-6).map((j) => `Jour ${j.jour} — ${j.texte}`).join('\n')}` : '',
        `Dernières scènes :\n${e.memoire.scenes.slice(-10).map((x) => `- ${x.texte}`).join('\n')}`,
        `Liens du héros (${e.hero.prenom}) :\n${liens}`,
        `Factions : ${e.factions.map((f) => `${f.nom} (${statutFaction(f, this.s.regles)})`).join(', ')}.`,
        e.hypotheses.length ? `Déductions du joueur :\n${e.hypotheses.map((h) => `- ${h.texte} → ${h.verdict}`).join('\n')}` : 'Le joueur n’a formulé aucune déduction.',
        'Écris maintenant l’épilogue.',
      ].filter(Boolean).join('\n\n')
      let texte = ''
      const rep = await this.texte('epilogue', 'grand', [{ texte: `${SYSTEME_EPILOGUE}\n\n${bibleFixe(e, 'grand')}` }], [{ role: 'user', contenu }], 6000, (d) => {
        texte += d
        this.emettre({ type: 'delta', texte })
      })
      const etat = structuredClone(this.etat)
      etat.termine = true
      etat.epilogue = rep.texte.trim()
      const notes: Notification[] = []
      for (const sx of nouveauxSucces(etat)) { etat.succes.push(sx.id); notes.push({ genre: 'succes', texte: `Succès : ${sx.nom}` }) }
      this.persisterEtat(etat)
      if (notes.length) this.emettre({ type: 'notifications', liste: notes })
    })
  }

  /** Réglages de contenu et de ton, modifiables en cours de partie. */
  modifierPreferences(p: Partial<Pick<Preferences, 'romance' | 'violence' | 'difficulte' | 'rythmeMystere'>>): GameState {
    if (this.occupe) return this.etat
    const etat = structuredClone(this.etat)
    if (typeof p.romance === 'boolean') etat.preferences.romance = p.romance
    if (p.violence && ['legere', 'moderee', 'sombre'].includes(p.violence)) etat.preferences.violence = p.violence
    if (p.difficulte && ['clemente', 'normale', 'rude'].includes(p.difficulte)) etat.preferences.difficulte = p.difficulte
    if (p.rythmeMystere && ['lent', 'normal', 'soutenu'].includes(p.rythmeMystere)) etat.preferences.rythmeMystere = p.rythmeMystere
    this.persisterEtat(etat)
    return etat
  }

  /** « Recommencer cette histoire » : même monde, mêmes images, depuis le début. */
  recommencer(): void {
    if (this.occupe) return
    this.s.depot.recommencer(this.partieId, this.maintenant())
    this.etat = this.s.depot.etatCourant(this.partieId)
    this.recharger()
    this.emettre({ type: 'etat', etat: this.etat })
  }
}

export type { DemandeJet }
