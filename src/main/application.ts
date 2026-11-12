/**
 * Assemble le cœur du jeu pour Electron : stockage, clés, fournisseurs, session, images.
 * Ce fichier ne contient aucune règle de jeu ; il branche les modules de `src/core`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { randomUUID } from 'node:crypto'
import type { EntreeJournalAppels, EvenementTour, FournisseurTexte, Reglages } from '@shared/types'
import { REGLAGES_DEFAUT } from '@shared/types'
import type { Initial, Instantane, NomCle, ResultatTest, UniversResume } from '@shared/ipc'
import { ErreurFournisseur, type FournisseurIA } from '@core/ai/types'
import { FournisseurAnthropic } from '@core/ai/fournisseurs/anthropic'
import { FournisseurOllama } from '@core/ai/fournisseurs/ollama'
import { FournisseurOpenAI } from '@core/ai/fournisseurs/openai'
import { FournisseurMock, HISTOIRE_VIDE, type HistoireDemo } from '@core/ai/fournisseurs/mock'
import { Depot, type Archive } from '@core/storage/depot'
import { Session, type Services } from '@core/game/session'
import { SUCCES, type PackUnivers } from '@core/game/creation'
import { fusionnerRegles, REGLES_DEFAUT, type Regles } from '@core/rules/regles'
import { VectoriseurIntegre, VectoriseurOllama, type Vectoriseur } from '@core/memory/vecteurs'
import { ServiceImages } from '@core/images/service'
import { FournisseurA1111, FournisseurComfy, FournisseurOpenAIImages, type FournisseurImages } from '@core/images/fournisseurs'
import { STYLES } from '@core/images/prompts'
import { CRENEAUX } from '@shared/types'
import { Secrets } from './secrets'

/** Fournisseur de remplacement quand la configuration est incomplète : chaque appel explique quoi faire. */
class FournisseurAbsent implements FournisseurIA {
  readonly gabarit = 'grand' as const
  constructor(readonly id: FournisseurTexte, private message: string) {}
  private refuser(): never { throw new ErreurFournisseur('cle', this.message, false) }
  async ecrire(): Promise<never> { this.refuser() }
  async structurer(): Promise<never> { this.refuser() }
  async tester(): Promise<ResultatTest> { return { ok: false, message: this.message } }
}

function fusion<T>(defaut: T, recu: unknown): T {
  if (defaut === null || typeof defaut !== 'object' || Array.isArray(defaut)) {
    return typeof recu === typeof defaut && recu !== null ? (recu as T) : defaut
  }
  const r: Record<string, unknown> = { ...(defaut as Record<string, unknown>) }
  if (recu && typeof recu === 'object') {
    for (const k of Object.keys(r)) if (k in (recu as object)) r[k] = fusion(r[k], (recu as Record<string, unknown>)[k])
  }
  return r as T
}

function lireJson(chemin: string): unknown {
  try {
    return JSON.parse(readFileSync(chemin, 'utf8'))
  } catch {
    return null
  }
}

export interface OptionsApplication {
  dossierDonnees: string
  dossierPacks: string
  version: string
  emettre(e: EvenementTour): void
  detourer?(png: Uint8Array): Uint8Array | null
  /** Délai du flux de démonstration, en ms par morceau (0 pour les tests). */
  delaiDemo?: number
  chiffrementDisponible(): boolean
}

export class Application {
  readonly depot: Depot
  readonly secrets: Secrets
  readonly images: ServiceImages
  readonly idSession = randomUUID()
  reglages: Reglages
  session: Session | null = null
  private regles: Regles
  private univers = new Map<string, PackUnivers>()
  private demo: HistoireDemo
  private journal: EntreeJournalAppels[] = []
  private compteurJournal = 0
  private fournisseurs = new Map<string, FournisseurIA>()
  private vectoriseurs = new Map<string, Vectoriseur>()
  private dossierImages: string

  constructor(private o: OptionsApplication) {
    mkdirSync(o.dossierDonnees, { recursive: true })
    this.dossierImages = join(o.dossierDonnees, 'images')
    this.depot = new Depot(join(o.dossierDonnees, 'resonance.db'))
    this.secrets = new Secrets(join(o.dossierDonnees, 'secrets.bin'))
    this.reglages = fusion(REGLAGES_DEFAUT, this.depot.lireReglage<unknown>('reglages', null))
    this.regles = fusionnerRegles(REGLES_DEFAUT, lireJson(join(o.dossierPacks, 'regles', 'defaut.json')))
    this.demo = { ...HISTOIRE_VIDE, ...((lireJson(join(o.dossierPacks, 'demo', 'histoire.json')) as Partial<HistoireDemo> | null) ?? {}) }
    this.chargerUnivers()
    this.images = new ServiceImages({
      depot: this.depot,
      fichiers: {
        ecrire: (partie, nom, donnees) => {
          const dossier = join(this.dossierImages, this.sur(partie))
          mkdirSync(dossier, { recursive: true })
          writeFileSync(join(dossier, basename(nom)), donnees)
        },
        lire: (partie, nom) => {
          const chemin = join(this.dossierImages, this.sur(partie), basename(nom))
          return existsSync(chemin) ? new Uint8Array(readFileSync(chemin)) : null
        },
        supprimerTout: (partie) => rmSync(join(this.dossierImages, this.sur(partie)), { recursive: true, force: true }),
      },
      fournisseur: () => this.fournisseurImages(),
      reglages: () => this.reglages,
      univers: (id) => this.univers.get(id),
      detourer: o.detourer,
      emettre: o.emettre,
      url: (partie, fichier, version) => `resonance-media://img/${encodeURIComponent(this.sur(partie))}/${encodeURIComponent(basename(fichier))}?v=${version}`,
      noterCout: (partie, cout) => this.depot.ajouterUsage(
        { fournisseur: 'openai-images', modele: this.reglages.images.openaiImagesModele, role: 'image', entree: 0, sortie: 0, cacheLecture: 0, cacheEcriture: 0, cout },
        partie, this.idSession, Date.now()),
    })
  }

  /** Nom de dossier sûr pour une partie (jamais de séparateur de chemin). */
  private sur(partie: string): string {
    return partie.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'x'
  }

  cheminImage(partie: string, fichier: string): string {
    return join(this.dossierImages, this.sur(partie), basename(fichier))
  }

  private chargerUnivers(): void {
    const dossier = join(this.o.dossierPacks, 'univers')
    if (!existsSync(dossier)) return
    for (const f of readdirSync(dossier).filter((x) => x.endsWith('.json')).sort()) {
      const j = lireJson(join(dossier, f)) as Record<string, any> | null
      if (!j || typeof j.id !== 'string' || typeof j.nom !== 'string') continue
      const emploi: Record<string, string> = {}
      for (const c of CRENEAUX) if (typeof j.emploiDuTemps?.[c] === 'string') emploi[c] = j.emploiDuTemps[c]
      const texte = (x: unknown) => (typeof x === 'string' ? x : '')
      const liste = (x: unknown) => (Array.isArray(x) ? x.filter((v) => typeof v === 'string') : [])
      this.univers.set(j.id, {
        id: j.id, nom: j.nom, accroche: texte(j.accroche), description: texte(j.description), theme: texte(j.theme) || 'libre',
        premisse: texte(j.premisse), cadre: texte(j.cadre), factions: liste(j.factions), archetypes: liste(j.archetypes),
        styleImage: texte(j.styleImage), tons: liste(j.tons), emploiDuTemps: emploi,
        evenements: (Array.isArray(j.evenements) ? j.evenements : [])
          .filter((e: any) => e && Number.isFinite(e.jour) && typeof e.nom === 'string')
          .map((e: any) => ({ jour: Math.round(e.jour), nom: e.nom, description: texte(e.description) })),
      })
    }
  }

  // ───────────────────────── Fournisseurs ─────────────────────────

  private fournisseurTexte(f: FournisseurTexte, modele: string): FournisseurIA {
    const r = this.reglages.ia
    if (f === 'mock') return this.memo('mock', () => new FournisseurMock(this.demo, this.o.delaiDemo ?? 14))
    if (!modele) return new FournisseurAbsent(f, 'Aucun modèle n’est choisi pour ce fournisseur. Ouvrez Réglages › IA, testez la connexion et choisissez un modèle.')
    if (f === 'anthropic') {
      const cle = this.secrets.lire('anthropic')
      if (!cle) return new FournisseurAbsent(f, 'Aucune clé API Anthropic n’est enregistrée. Ajoutez-la dans Réglages › IA.')
      // La clé elle-même ne sert jamais d'identifiant de cache : seulement sa longueur et ses bords.
      return this.memo(`anthropic:${cle.length}:${cle.slice(-6)}`, () => new FournisseurAnthropic(cle))
    }
    if (f === 'ollama') return this.memo(`ollama:${r.ollamaUrl}:${r.ollamaContexte}`, () => new FournisseurOllama(r.ollamaUrl, r.ollamaContexte))
    const cle = this.secrets.lire('openai')
    return this.memo(`openai:${r.openaiUrl}:${cle.length}:${r.openaiGabarit}`, () => new FournisseurOpenAI(r.openaiUrl, cle, r.openaiGabarit))
  }

  private memo(cle: string, creer: () => FournisseurIA): FournisseurIA {
    let f = this.fournisseurs.get(cle)
    if (!f) { f = creer(); this.fournisseurs.set(cle, f) }
    return f
  }

  ia(): ReturnType<Services['ia']> {
    const r = this.reglages.ia
    const fl = r.fournisseurLeger || r.fournisseur
    const modeleGrand = r.modeles[r.fournisseur]?.grand ?? ''
    const modeleLeger = r.modeles[fl]?.leger || (fl === r.fournisseur ? modeleGrand : '')
    return { grand: this.fournisseurTexte(r.fournisseur, modeleGrand), leger: this.fournisseurTexte(fl, modeleLeger), modeleGrand, modeleLeger }
  }

  private vectoriseur(): Vectoriseur {
    const r = this.reglages.ia
    const cle = r.vectoriseur === 'ollama' && r.modeleVecteurs ? `ollama:${r.ollamaUrl}:${r.modeleVecteurs}` : 'integre'
    let v = this.vectoriseurs.get(cle)
    if (!v) {
      if (cle === 'integre') v = new VectoriseurIntegre()
      else {
        const ollama = new FournisseurOllama(r.ollamaUrl, r.ollamaContexte)
        v = new VectoriseurOllama((modele, textes) => ollama.vectoriser(modele, textes), r.modeleVecteurs)
      }
      this.vectoriseurs.set(cle, v)
    }
    return v
  }

  private fournisseurImages(): FournisseurImages | null {
    const r = this.reglages.images
    if (r.fournisseur === 'comfyui') return new FournisseurComfy(r.comfyUrl, r.comfyModele)
    if (r.fournisseur === 'a1111') return new FournisseurA1111(r.a1111Url)
    if (r.fournisseur === 'openai-images') {
      const cle = this.secrets.lire('openai-images')
      return cle ? new FournisseurOpenAIImages(r.openaiImagesUrl, cle, r.openaiImagesModele) : null
    }
    return null
  }

  private services(): Services {
    return {
      depot: this.depot,
      ia: () => this.ia(),
      reglages: () => this.reglages,
      regles: this.regles,
      univers: (id) => this.univers.get(id),
      vectoriseur: () => this.vectoriseur(),
      emettre: this.o.emettre,
      idSession: this.idSession,
      journaliser: (e) => {
        this.journal.push({ ...e, id: ++this.compteurJournal })
        if (this.journal.length > 150) this.journal.splice(0, this.journal.length - 150)
      },
      apresScene: (etat, rapport, lignes) => this.images.apresScene(etat, rapport, lignes),
    }
  }

  // ───────────────────────── Démarrage et réglages ─────────────────────────

  initial(): Initial {
    const cles = Object.fromEntries((['anthropic', 'openai', 'openai-images'] as NomCle[]).map((n) => [n, this.secrets.masquee(n)])) as Record<NomCle, string | null>
    return {
      version: this.o.version,
      reglages: this.reglages,
      parties: this.depot.listerParties(),
      univers: [...this.univers.values()].map<UniversResume>((u) => ({
        id: u.id, nom: u.nom, accroche: u.accroche, description: u.description, theme: u.theme, premisse: u.premisse, tons: u.tons,
        emploiDuTemps: u.emploiDuTemps as Record<string, string>, evenements: u.evenements,
      })),
      styles: Object.entries(STYLES).map(([id, s]) => ({ id, nom: s.nom })),
      cles,
      succes: SUCCES.map((s) => ({ id: s.id, nom: s.nom, description: s.description })),
      chiffrementDisponible: this.o.chiffrementDisponible(),
      demo: this.demo.scenes.length > 0,
    }
  }

  ecrireReglages(recus: unknown): Reglages {
    const r = fusion(REGLAGES_DEFAUT, recus)
    r.ia.ollamaContexte = Math.max(2048, Math.min(262144, Math.round(r.ia.ollamaContexte)))
    r.couts.plafondSession = Math.max(0, r.couts.plafondSession)
    r.couts.plafondPartie = Math.max(0, r.couts.plafondPartie)
    this.reglages = r
    this.depot.ecrireReglage('reglages', r)
    return r
  }

  async testerTexte(taille: 'grand' | 'leger'): Promise<ResultatTest> {
    const ia = this.ia()
    return taille === 'grand' ? ia.grand.tester(ia.modeleGrand) : ia.leger.tester(ia.modeleLeger)
  }

  async testerImages(): Promise<ResultatTest> {
    const r = this.reglages.images
    if (r.fournisseur === 'procedural') return { ok: true, message: 'Mode procédural : rien à configurer, aucune connexion nécessaire.' }
    if (r.fournisseur === 'openai-images' && !this.secrets.lire('openai-images')) return { ok: false, message: 'Aucune clé API enregistrée pour le service d’images.' }
    const f = this.fournisseurImages()
    return f ? f.tester() : { ok: false, message: 'Fournisseur d’images non configuré.' }
  }

  // ───────────────────────── Parties ─────────────────────────

  private exiger(): Session {
    if (!this.session) throw new Error('Aucune partie n’est ouverte.')
    return this.session
  }

  instantane(): Instantane {
    const s = this.exiger()
    return { etat: s.etat, historique: s.historique(), bilan: s.bilan(), rapportManquant: s.rapportManquant }
  }

  async creer(preferences: unknown, heros: unknown): Promise<Instantane> {
    const s = this.services()
    const p = fusion((await import('@core/game/creation')).PREFERENCES_DEFAUT, preferences)
    const h = (heros ?? {}) as Record<string, unknown>
    this.session = await Session.creer(s, p, {
      prenom: String(h.prenom ?? ''), age: Number(h.age ?? 19),
      forces: Array.isArray(h.forces) ? (h.forces as any[]).slice(0, 2) : [], faiblesse: (h.faiblesse as any) ?? null,
    })
    return this.instantane()
  }

  ouvrir(id: string): Instantane {
    this.session = Session.ouvrir(this.services(), String(id))
    return this.instantane()
  }

  fermer(): void {
    this.session?.annuler()
    this.session = null
  }

  /** « Nouvelle histoire » efface tout, y compris les images. */
  supprimer(id: string) {
    if (this.session?.partieId === id) this.fermer()
    this.depot.supprimerPartie(String(id))
    this.images.supprimerTout(String(id))
    return this.depot.listerParties()
  }

  exporterVers(id: string, chemin: string): void {
    const archive = this.depot.exporter(String(id), (fichier) => {
      const c = this.cheminImage(String(id), fichier)
      return existsSync(c) ? new Uint8Array(readFileSync(c)) : null
    })
    writeFileSync(chemin, gzipSync(Buffer.from(JSON.stringify(archive), 'utf8')))
  }

  importerDepuis(chemin: string) {
    const brut = readFileSync(chemin)
    let texte: string
    try {
      texte = gunzipSync(brut).toString('utf8')
    } catch {
      texte = brut.toString('utf8')
    }
    let archive: Archive
    try {
      archive = JSON.parse(texte)
    } catch {
      throw new Error('Ce fichier n’est pas une sauvegarde Résonance valide.')
    }
    const id = randomUUID().replace(/-/g, '').slice(0, 12)
    this.depot.importer(archive, id, (fichier, donnees) => {
      const dossier = join(this.dossierImages, this.sur(id))
      mkdirSync(dossier, { recursive: true })
      writeFileSync(join(dossier, basename(fichier)), donnees)
    }, Date.now())
    return this.depot.listerParties()
  }

  // ───────────────────────── Jeu ─────────────────────────

  jeu() {
    return this.exiger()
  }

  journalDev(): EntreeJournalAppels[] {
    return this.reglages.dev ? [...this.journal].reverse() : []
  }
}
