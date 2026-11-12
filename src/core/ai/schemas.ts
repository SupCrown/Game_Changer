/**
 * Schémas des sorties structurées demandées aux IA.
 *
 * Deux niveaux :
 *  - les schémas Zod stricts (tous les champs requis) servent à contraindre la sortie
 *    quand le fournisseur le permet (Claude, Ollama) ;
 *  - les fonctions `lire*` sont tolérantes : elles acceptent n'importe quel objet
 *    (champ manquant, nombre écrit « +4 », synonyme) et renvoient toujours une valeur saine.
 *    Elles sont appliquées dans tous les cas, quel que soit le fournisseur.
 */
import { z } from 'zod'
import { EXPRESSIONS, STATS, TYPES_LIEU, CRENEAUX, type Creneau, type Humeur, type StatId, type TypeLieu, type TypeScene } from '@shared/types'

// ───────────────────────── Outils de lecture tolérante ─────────────────────────

export function txt(x: unknown, defaut = ''): string {
  if (typeof x === 'string') return x.trim()
  if (typeof x === 'number' || typeof x === 'boolean') return String(x)
  return defaut
}

export function nombre(x: unknown, defaut = 0): number {
  if (typeof x === 'number' && Number.isFinite(x)) return x
  if (typeof x === 'string') {
    const n = parseFloat(x.replace(',', '.').replace(/[^\d.+-]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return defaut
}

export function bool(x: unknown, defaut = false): boolean {
  if (typeof x === 'boolean') return x
  if (typeof x === 'string') return /^(true|oui|vrai|yes|1)$/i.test(x.trim())
  if (typeof x === 'number') return x !== 0
  return defaut
}

export function liste(x: unknown): unknown[] {
  if (Array.isArray(x)) return x
  if (x === null || x === undefined || x === '') return []
  return [x]
}

export function listeTxt(x: unknown, max = 50): string[] {
  return liste(x).map((v) => txt(v)).filter(Boolean).slice(0, max)
}

export function sansAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function parmi<T extends string>(x: unknown, valeurs: readonly T[], defaut: T): T {
  const s = sansAccents(txt(x)).replace(/[\s_]+/g, '-')
  for (const v of valeurs) if (sansAccents(v) === s) return v
  for (const v of valeurs) if (s && (s.startsWith(sansAccents(v)) || sansAccents(v).startsWith(s))) return v
  return defaut
}

function obj(x: unknown): Record<string, unknown> {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
}

/** Extrait le premier objet JSON d'un texte (les modèles locaux ajoutent souvent du texte autour). */
export function extraireJson(texte: string): unknown {
  const brut = texte.trim()
  try {
    return JSON.parse(brut)
  } catch {
    /* on cherche plus loin */
  }
  const sansCloture = brut.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(sansCloture)
  } catch {
    /* on cherche plus loin */
  }
  const debut = brut.indexOf('{')
  if (debut < 0) throw new Error('Aucun objet JSON dans la réponse.')
  let profondeur = 0
  let dansChaine = false
  let echappe = false
  for (let i = debut; i < brut.length; i++) {
    const c = brut[i]
    if (dansChaine) {
      if (echappe) echappe = false
      else if (c === '\\') echappe = true
      else if (c === '"') dansChaine = false
      continue
    }
    if (c === '"') dansChaine = true
    else if (c === '{') profondeur++
    else if (c === '}') {
      profondeur--
      if (profondeur === 0) return JSON.parse(brut.slice(debut, i + 1))
    }
  }
  throw new Error('Objet JSON incomplet dans la réponse.')
}

// ───────────────────────── Rapport de scène (Greffier) ─────────────────────────

export const TYPES_CHANGEMENT = ['resonance', 'reputation', 'pv', 'mana', 'or', 'objet', 'etat'] as const
export type TypeChangement = (typeof TYPES_CHANGEMENT)[number]

export interface Changement {
  type: TypeChangement
  /** Nom du personnage, de la faction, de l'objet ou de l'état. Vide pour pv / mana / or. */
  cible: string
  /** Variation. Objet : +n ajouté, -n retiré. État : +1 ajouté, -1 retiré. */
  delta: number
  motif: string
}

const HUMEURS = ['calme', 'joyeux', 'tendu', 'mystere', 'romance', 'combat', 'triste'] as const
const EFFETS = ['aucun', 'tremblement', 'flash', 'fondu'] as const
const METEOS = ['aucune', 'pluie', 'neige', 'petales', 'brume'] as const

export interface RapportScene {
  resume: string
  lieu: string
  typeLieu: TypeLieu
  presents: string[]
  changements: Changement[]
  journal: { type: 'objectif' | 'indice' | 'rumeur'; texte: string }[]
  objectifsAccomplis: string[]
  faits: string[]
  promesses: string[]
  souvenirs: { personnage: string; texte: string }[]
  nouveauxPersonnages: { nom: string; description: string; apparence: string }[]
  codex: { categorie: 'personnage' | 'lieu' | 'faction' | 'monde' | 'objet'; titre: string; texte: string }[]
  pistes: string[]
  finCreneau: boolean
  indiceRevele: boolean
  humeur: Humeur
  effet: (typeof EFFETS)[number]
  meteo: (typeof METEOS)[number]
  momentFort: { titre: string; description: string } | null
  combat: { enjeu: string; ennemis: { nom: string; pv: number; attaque: number; defense: number }[] } | null
  incoherence: string
}

export const RapportSceneSchema = z.object({
  resume: z.string().describe('2 à 3 phrases : ce qui s’est réellement passé dans la scène.'),
  lieu: z.string().describe('Nom du lieu où se termine la scène.'),
  typeLieu: z.enum(TYPES_LIEU),
  presents: z.array(z.string()).describe('Noms des personnages présents (hors héros).'),
  changements: z.array(
    z.object({
      type: z.enum(TYPES_CHANGEMENT),
      cible: z.string(),
      delta: z.number(),
      motif: z.string(),
    }),
  ).describe('Changements d’état PROPOSÉS, justifiés par la scène. Souvent vide.'),
  journal: z.array(z.object({ type: z.enum(['objectif', 'indice', 'rumeur']), texte: z.string() }))
    .describe('Uniquement si quelque chose de vraiment nouveau est apparu. Vide la plupart du temps.'),
  objectifsAccomplis: z.array(z.string()),
  faits: z.array(z.string()).describe('Faits canoniques nouveaux et durables (0 à 3).'),
  promesses: z.array(z.string()).describe('Promesses faites par ou au héros, rendez-vous pris.'),
  souvenirs: z.array(z.object({ personnage: z.string(), texte: z.string() }))
    .describe('Pour chaque personnage important présent : une phrase, de SON point de vue.'),
  nouveauxPersonnages: z.array(z.object({ nom: z.string(), description: z.string(), apparence: z.string() })),
  codex: z.array(z.object({ categorie: z.enum(['personnage', 'lieu', 'faction', 'monde', 'objet']), titre: z.string(), texte: z.string() })),
  pistes: z.array(z.string()).describe('3 actions possibles pour le héros, courtes, variées, à l’infinitif.'),
  finCreneau: z.boolean().describe('Vrai si la scène est conclue et que le temps peut avancer.'),
  indiceRevele: z.boolean().describe('Vrai seulement si un élément réel du grand mystère a été révélé.'),
  humeur: z.enum(HUMEURS),
  effet: z.enum(EFFETS),
  meteo: z.enum(METEOS),
  momentFort: z.object({ titre: z.string(), description: z.string() }).nullable()
    .describe('Rare : un moment marquant qui mérite une illustration. Sinon null.'),
  combat: z.object({
    enjeu: z.string(),
    ennemis: z.array(z.object({ nom: z.string(), pv: z.number(), attaque: z.number(), defense: z.number() })),
  }).nullable().describe('Seulement si un combat physique vient d’éclater. Sinon null.'),
  incoherence: z.string().describe('Contradiction avec les faits établis, ou chaîne vide.'),
})

export function lireRapport(brut: unknown): RapportScene {
  const o = obj(brut)
  const moment = obj(o.momentFort ?? o.moment_fort)
  const combat = obj(o.combat)
  const ennemis = liste(combat.ennemis).map(obj).map((e) => ({
    nom: txt(e.nom, 'Adversaire'),
    pv: nombre(e.pv, 12),
    attaque: nombre(e.attaque, 3),
    defense: nombre(e.defense, 11),
  }))
  return {
    resume: txt(o.resume),
    lieu: txt(o.lieu),
    typeLieu: parmi(o.typeLieu ?? o.type_lieu, TYPES_LIEU, 'salle'),
    presents: listeTxt(o.presents ?? o.personnages_presents, 12),
    changements: liste(o.changements).map(obj).map((c) => ({
      type: parmi(c.type, TYPES_CHANGEMENT, 'etat'),
      cible: txt(c.cible),
      delta: nombre(c.delta, 0),
      motif: txt(c.motif),
    })).filter((c) => c.delta !== 0).slice(0, 12),
    journal: liste(o.journal).map(obj).map((j) => ({
      type: parmi(j.type, ['objectif', 'indice', 'rumeur'] as const, 'rumeur'),
      texte: txt(j.texte),
    })).filter((j) => j.texte).slice(0, 4),
    objectifsAccomplis: listeTxt(o.objectifsAccomplis ?? o.objectifs_accomplis, 6),
    faits: listeTxt(o.faits, 4),
    promesses: listeTxt(o.promesses, 4),
    souvenirs: liste(o.souvenirs).map(obj).map((s) => ({ personnage: txt(s.personnage), texte: txt(s.texte) }))
      .filter((s) => s.personnage && s.texte).slice(0, 8),
    nouveauxPersonnages: liste(o.nouveauxPersonnages ?? o.nouveaux_personnages).map(obj).map((p) => ({
      nom: txt(p.nom), description: txt(p.description), apparence: txt(p.apparence),
    })).filter((p) => p.nom).slice(0, 3),
    codex: liste(o.codex).map(obj).map((c) => ({
      categorie: parmi(c.categorie, ['personnage', 'lieu', 'faction', 'monde', 'objet'] as const, 'monde'),
      titre: txt(c.titre),
      texte: txt(c.texte),
    })).filter((c) => c.titre && c.texte).slice(0, 4),
    pistes: listeTxt(o.pistes, 4),
    finCreneau: bool(o.finCreneau ?? o.fin_creneau, false),
    indiceRevele: bool(o.indiceRevele ?? o.indice_revele, false),
    humeur: parmi(o.humeur, HUMEURS, 'calme'),
    effet: parmi(o.effet, EFFETS, 'aucun'),
    meteo: parmi(o.meteo, METEOS, 'aucune'),
    momentFort: txt(moment.titre) ? { titre: txt(moment.titre), description: txt(moment.description) } : null,
    combat: ennemis.length ? { enjeu: txt(combat.enjeu, 'Un affrontement'), ennemis: ennemis.slice(0, 4) } : null,
    incoherence: /^(aucune?|non|rien|ras|null|n\/a)\.?$/i.test(txt(o.incoherence)) ? '' : txt(o.incoherence),
  }
}

export const RAPPORT_VIDE: RapportScene = lireRapport({})

// ───────────────────────── Cycle de nuit (agents + résumé du jour) ─────────────────────────

export interface RapportNuit {
  resumeJour: string
  horsChamp: { personnage: string; action: string; consequence: string }[]
  opinions: { personnage: string; opinion: string }[]
  arcs: { personnage: string; avance: boolean }[]
}

export const RapportNuitSchema = z.object({
  resumeJour: z.string().describe('4 à 6 phrases : la journée du héros, ce qui compte pour la suite.'),
  horsChamp: z.array(z.object({
    personnage: z.string(),
    action: z.string().describe('Ce que ce personnage a fait hors de la vue du héros.'),
    consequence: z.string().describe('Ce que le héros pourra en voir ou en apprendre plus tard.'),
  })),
  opinions: z.array(z.object({ personnage: z.string(), opinion: z.string() })),
  arcs: z.array(z.object({ personnage: z.string(), avance: z.boolean() })),
})

export function lireNuit(brut: unknown): RapportNuit {
  const o = obj(brut)
  return {
    resumeJour: txt(o.resumeJour ?? o.resume_jour ?? o.resume),
    horsChamp: liste(o.horsChamp ?? o.hors_champ).map(obj).map((h) => ({
      personnage: txt(h.personnage), action: txt(h.action), consequence: txt(h.consequence),
    })).filter((h) => h.personnage && h.action).slice(0, 8),
    opinions: liste(o.opinions).map(obj).map((p) => ({ personnage: txt(p.personnage), opinion: txt(p.opinion) }))
      .filter((p) => p.personnage && p.opinion).slice(0, 12),
    arcs: liste(o.arcs).map(obj).map((a) => ({ personnage: txt(a.personnage), avance: bool(a.avance) }))
      .filter((a) => a.personnage).slice(0, 12),
  }
}

// ───────────────────────── Plan du Metteur en scène ─────────────────────────

const TYPES_SCENE = ['quotidien', 'relation', 'evenement', 'mystere', 'libre'] as const

export interface PlanBrut {
  intention: string
  consignes: { creneau: Creneau; type: TypeScene; consigne: string; personnages: string[] }[]
  tension: number
  finDeChapitre: boolean
  finDeLHistoire: boolean
}

export const PlanSchema = z.object({
  intention: z.string().describe('Une phrase : ce que cette journée doit apporter à l’histoire.'),
  consignes: z.array(z.object({
    creneau: z.enum(CRENEAUX),
    type: z.enum(TYPES_SCENE),
    consigne: z.string().describe('Une ou deux phrases pour le Narrateur.'),
    personnages: z.array(z.string()),
  })),
  tension: z.number().describe('Tension dramatique visée, de 0 (paisible) à 10 (crise).'),
  finDeChapitre: z.boolean(),
  finDeLHistoire: z.boolean().describe('Vrai seulement si le dernier acte est résolu.'),
})

export function lirePlan(brut: unknown): PlanBrut {
  const o = obj(brut)
  return {
    intention: txt(o.intention),
    consignes: liste(o.consignes).map(obj).map((c) => ({
      creneau: parmi(c.creneau, CRENEAUX, 'matin'),
      type: parmi(c.type, TYPES_SCENE, 'quotidien') as TypeScene,
      consigne: txt(c.consigne),
      personnages: listeTxt(c.personnages, 4),
    })).filter((c) => c.consigne).slice(0, 6),
    tension: Math.max(0, Math.min(10, nombre(o.tension, 2))),
    finDeChapitre: bool(o.finDeChapitre ?? o.fin_de_chapitre),
    finDeLHistoire: bool(o.finDeLHistoire ?? o.fin_de_l_histoire ?? o.finDeLhistoire),
  }
}

// ───────────────────────── Génération du monde ─────────────────────────

export interface MondeGenere {
  titre: string
  monde: { nom: string; description: string; cadre: string; regles: string[]; veriteCachee: string; actes: { titre: string; resume: string }[] }
  factions: { nom: string; description: string; reputation: number }[]
  personnages: {
    nom: string; role: 'heroine' | 'majeur' | 'secondaire'; age: number; archetype: string; description: string
    apparence: string; personnalite: string; voix: string; objectifs: string[]; secrets: string[]
    arcTitre: string; arcEtapes: string[]; opinion: string
    paliers: { seuil: number; nom: string; description: string }[]
    rivales: string[]
  }[]
  lieux: { nom: string; description: string; type: TypeLieu }[]
  heros: { apparence: string; capacite: { nom: string; description: string }; objets: { nom: string; description: string }[]; or: number }
  ouverture: string
  objectifInitial: string
}

export const MondeSchema = z.object({
  titre: z.string().describe('Titre de cette histoire.'),
  monde: z.object({
    nom: z.string(),
    description: z.string().describe('Le monde en 4 à 6 phrases.'),
    cadre: z.string().describe('Le lieu principal où vit le héros (académie ou équivalent), 3 à 5 phrases.'),
    regles: z.array(z.string()).describe('4 à 6 règles du monde (magie, société, interdits).'),
    veriteCachee: z.string().describe('La vérité que le joueur ne découvrira que tard. 5 à 8 phrases, précise.'),
    actes: z.array(z.object({ titre: z.string(), resume: z.string() })).describe('3 ou 4 actes.'),
  }),
  factions: z.array(z.object({ nom: z.string(), description: z.string(), reputation: z.number() })).describe('Exactement 4 factions.'),
  personnages: z.array(z.object({
    nom: z.string(),
    role: z.enum(['heroine', 'majeur', 'secondaire']),
    age: z.number().describe('18 ou plus, obligatoirement.'),
    archetype: z.string(),
    description: z.string(),
    apparence: z.string().describe('Description visuelle stable : cheveux, yeux, tenue, allure. Adulte, habillée.'),
    personnalite: z.string(),
    voix: z.string().describe('Sa façon de parler : registre, tics, rythme.'),
    objectifs: z.array(z.string()),
    secrets: z.array(z.string()),
    arcTitre: z.string(),
    arcEtapes: z.array(z.string()),
    opinion: z.string().describe('Ce qu’elle pense du héros au début.'),
    paliers: z.array(z.object({ seuil: z.number(), nom: z.string(), description: z.string() }))
      .describe('Pour les héroïnes : 4 paliers (25 bonus passif, 50 technique combinée, 75 levier politique, 100 capacité unique). Vide sinon.'),
    rivales: z.array(z.string()).describe('Noms des personnages avec qui sa Résonance s’oppose.'),
  })),
  lieux: z.array(z.object({ nom: z.string(), description: z.string(), type: z.enum(TYPES_LIEU) })),
  heros: z.object({
    apparence: z.string(),
    capacite: z.object({ nom: z.string(), description: z.string() }),
    objets: z.array(z.object({ nom: z.string(), description: z.string() })),
    or: z.number(),
  }),
  ouverture: z.string().describe('La situation de la toute première scène, en 2 ou 3 phrases, sans mystère.'),
  objectifInitial: z.string(),
})

export function lireMonde(brut: unknown): MondeGenere {
  const o = obj(brut)
  const m = obj(o.monde)
  const h = obj(o.heros)
  const cap = obj(h.capacite)
  return {
    titre: txt(o.titre, 'Résonance'),
    monde: {
      nom: txt(m.nom, 'Le Royaume'),
      description: txt(m.description),
      cadre: txt(m.cadre),
      regles: listeTxt(m.regles, 8),
      veriteCachee: txt(m.veriteCachee ?? m.verite_cachee),
      actes: liste(m.actes).map(obj).map((a) => ({ titre: txt(a.titre), resume: txt(a.resume) })).filter((a) => a.titre).slice(0, 5),
    },
    factions: liste(o.factions).map(obj).map((f) => ({
      nom: txt(f.nom), description: txt(f.description), reputation: nombre(f.reputation, 0),
    })).filter((f) => f.nom).slice(0, 4),
    personnages: liste(o.personnages).map(obj).map((p) => ({
      nom: txt(p.nom),
      role: parmi(p.role, ['heroine', 'majeur', 'secondaire'] as const, 'secondaire'),
      age: Math.max(18, Math.round(nombre(p.age, 20))),
      archetype: txt(p.archetype),
      description: txt(p.description),
      apparence: txt(p.apparence),
      personnalite: txt(p.personnalite),
      voix: txt(p.voix),
      objectifs: listeTxt(p.objectifs, 5),
      secrets: listeTxt(p.secrets, 5),
      arcTitre: txt(p.arcTitre ?? p.arc_titre),
      arcEtapes: listeTxt(p.arcEtapes ?? p.arc_etapes, 6),
      opinion: txt(p.opinion),
      paliers: liste(p.paliers).map(obj).map((x) => ({ seuil: nombre(x.seuil), nom: txt(x.nom), description: txt(x.description) }))
        .filter((x) => [25, 50, 75, 100].includes(x.seuil) && x.nom),
      rivales: listeTxt(p.rivales, 4),
    })).filter((p) => p.nom).slice(0, 14),
    lieux: liste(o.lieux).map(obj).map((l) => ({
      nom: txt(l.nom), description: txt(l.description), type: parmi(l.type, TYPES_LIEU, 'salle'),
    })).filter((l) => l.nom).slice(0, 16),
    heros: {
      apparence: txt(h.apparence),
      capacite: { nom: txt(cap.nom, 'Obstination'), description: txt(cap.description, 'Ne renonce jamais tout à fait.') },
      objets: liste(h.objets).map(obj).map((x) => ({ nom: txt(x.nom), description: txt(x.description) })).filter((x) => x.nom).slice(0, 5),
      or: Math.max(0, Math.min(50, Math.round(nombre(h.or, 5)))),
    },
    ouverture: txt(o.ouverture),
    objectifInitial: txt(o.objectifInitial ?? o.objectif_initial),
  }
}

// ───────────────────────── Fin de chapitre, déduction ─────────────────────────

export interface RapportChapitre { resumeChapitre: string; chronique: string }

export const ChapitreSchema = z.object({
  resumeChapitre: z.string().describe('Le chapitre écoulé en 6 à 10 phrases.'),
  chronique: z.string().describe('La chronique complète de l’histoire depuis le début, mise à jour, 10 à 20 phrases.'),
})

export function lireChapitre(brut: unknown): RapportChapitre {
  const o = obj(brut)
  return { resumeChapitre: txt(o.resumeChapitre ?? o.resume_chapitre), chronique: txt(o.chronique) }
}

export interface Verdict { verdict: 'juste' | 'partielle' | 'fausse'; commentaire: string; consequence: string }

export const VerdictSchema = z.object({
  verdict: z.enum(['juste', 'partielle', 'fausse']),
  commentaire: z.string().describe('Réponse au joueur, sans rien révéler de plus que ce qu’il a déduit.'),
  consequence: z.string().describe('Si la déduction est juste : ce que cela débloque dans l’histoire. Sinon vide.'),
})

export function lireVerdict(brut: unknown): Verdict {
  const o = obj(brut)
  return {
    verdict: parmi(o.verdict, ['juste', 'partielle', 'fausse'] as const, 'fausse'),
    commentaire: txt(o.commentaire),
    consequence: txt(o.consequence),
  }
}

// ───────────────────────── Divers ─────────────────────────

export function estStat(x: unknown): StatId | null {
  const s = sansAccents(txt(x))
  for (const v of STATS) if (v === s) return v
  const alias: Record<string, StatId> = {
    dexterite: 'agilite', adresse: 'agilite', intelligence: 'esprit', savoir: 'esprit', magie: 'esprit',
    courage: 'volonte', charisme: 'charme', eloquence: 'charme', intuition: 'perception', vigilance: 'perception',
    endurance: 'force', physique: 'force',
  }
  return alias[s] ?? null
}

export { EXPRESSIONS }
