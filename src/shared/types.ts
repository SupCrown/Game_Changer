/**
 * Contrat de données partagé entre le cœur du jeu (processus principal) et l'interface.
 * Aucun import d'Electron, de Node ou du DOM ici.
 */

// ───────────────────────── Vocabulaire de base ─────────────────────────

export const EXPRESSIONS = ['neutre', 'sourire', 'colere', 'gene', 'tristesse', 'surprise'] as const
export type Expression = (typeof EXPRESSIONS)[number]

export const STATS = ['force', 'agilite', 'esprit', 'volonte', 'charme', 'perception'] as const
export type StatId = (typeof STATS)[number]

export const CRENEAUX = ['matin', 'midi', 'apres-midi', 'soir', 'nuit'] as const
export type Creneau = (typeof CRENEAUX)[number]

export type Lumiere = 'jour' | 'crepuscule' | 'nuit'

export const TYPES_LIEU = [
  'salle', 'bibliotheque', 'cour', 'jardin', 'dortoir', 'refectoire', 'arene',
  'couloir', 'ville', 'foret', 'tour', 'souterrain', 'bureau', 'toit', 'rive',
] as const
export type TypeLieu = (typeof TYPES_LIEU)[number]

export type TypeScene = 'quotidien' | 'relation' | 'evenement' | 'mystere' | 'libre' | 'combat'
export type Humeur = 'calme' | 'joyeux' | 'tendu' | 'mystere' | 'romance' | 'combat' | 'triste'

export type De = 'D20' | 'D100'

// ───────────────────────── Héros ─────────────────────────

export interface Capacite {
  id: string
  nom: string
  description: string
  source: 'base' | 'resonance' | 'histoire'
  coutMana?: number
}

export interface Objet {
  nom: string
  description: string
  quantite: number
}

export interface Hero {
  prenom: string
  age: number
  apparence: string
  pv: number
  pvMax: number
  mana: number
  manaMax: number
  stats: Record<StatId, number>
  capacites: Capacite[]
  etats: string[]
  inventaire: Objet[]
  or: number
}

// ───────────────────────── Monde ─────────────────────────

export interface Palier {
  seuil: 25 | 50 | 75 | 100
  nom: string
  description: string
}

export interface Personnage {
  id: string
  nom: string
  role: 'heroine' | 'majeur' | 'secondaire'
  age: number
  archetype: string
  description: string
  /** Description visuelle stable, utilisée pour les images (toujours adulte, habillée). */
  apparence: string
  personnalite: string
  /** Sa manière de parler. */
  voix: string
  objectifs: string[]
  secrets: string[]
  arc: { titre: string; etapes: string[]; etape: number }
  /** Ce qu'elle pense du héros aujourd'hui (mis à jour chaque nuit). */
  opinion: string
  /** Souvenirs de son point de vue. */
  souvenirs: string[]
  resonance: number
  paliers: Palier[]
  paliersDebloques: number[]
  /** Identifiants des personnages dont la Résonance s'oppose à la sienne. */
  rivales: string[]
  statut: 'vivant' | 'mort' | 'absent'
  rencontre: boolean
  couleur: string
  /** Graine stable pour les images et la voix. */
  graine: number
  /** Moments clés du lien avec le héros. */
  moments: { jour: number; texte: string }[]
}

export interface Faction {
  id: string
  nom: string
  description: string
  reputation: number
}

export interface Lieu {
  id: string
  nom: string
  description: string
  type: TypeLieu
  decouvert: boolean
}

export interface Monde {
  nom: string
  univers: string
  ton: string
  style: string
  description: string
  cadre: string
  regles: string[]
  veriteCachee: string
  actes: { titre: string; resume: string }[]
  premisse: string
  /** Situation de la toute première scène. */
  ouverture: string
  theme: string
  titre: string
}

// ───────────────────────── Journal, enquête, codex ─────────────────────────

export interface EntreeJournal {
  id: string
  type: 'objectif' | 'indice' | 'rumeur'
  texte: string
  statut: 'actif' | 'accompli' | 'abandonne'
  jour: number
}

export interface Hypothese {
  id: string
  indices: string[]
  texte: string
  verdict: 'juste' | 'partielle' | 'fausse'
  commentaire: string
  jour: number
}

export interface EntreeCodex {
  id: string
  categorie: 'personnage' | 'lieu' | 'faction' | 'monde' | 'objet'
  titre: string
  texte: string
  jour: number
}

// ───────────────────────── Temps, rythme, mémoire ─────────────────────────

export interface Calendrier {
  jour: number
  creneau: number
  scenesDansCreneau: number
}

export interface ConsigneCreneau {
  creneau: Creneau
  type: TypeScene
  consigne: string
  personnages: string[]
}

export interface PlanJour {
  jour: number
  intention: string
  consignes: ConsigneCreneau[]
}

export interface Rythme {
  chapitre: number
  indicesRestants: number
  scenesDepuisIndice: number
  totalScenes: number
  tension: number
}

export interface Memoire {
  chronique: string
  chapitres: { chapitre: number; texte: string }[]
  jours: { jour: number; texte: string }[]
  scenes: { sceneId: string; jour: number; texte: string }[]
  faits: string[]
  promesses: { texte: string; tenue: boolean }[]
  /** Événements hors champ pas encore montrés au joueur. */
  horsChamp: { jour: number; personnage: string; texte: string; revele: boolean }[]
  /** Remarque du Gardien à corriger discrètement dans la scène suivante. */
  correction?: string
  /** Index (dans le chemin de scènes) à partir duquel les scènes sont envoyées en entier. */
  debutFenetre: number
  /** Nombre de faits déjà placés dans le bloc de mémoire stable (cache des prompts). */
  faitsStables: number
}

// ───────────────────────── Dés et combat ─────────────────────────

export interface DemandeJet {
  de: De
  stat: StatId
  difficulte: number
  motif: string
}

export interface ResultatJet extends DemandeJet {
  valeur: number
  modificateur: number
  total: number
  reussite: boolean
  critique: 'reussite' | 'echec' | null
  virtuel: boolean
}

export interface Combattant {
  id: string
  nom: string
  camp: 'heros' | 'allie' | 'ennemi'
  pv: number
  pvMax: number
  attaque: number
  defense: number
  etats: string[]
}

export interface Combat {
  actif: boolean
  tour: number
  combattants: Combattant[]
  journal: string[]
  enjeu: string
  issue?: 'victoire' | 'defaite' | 'fuite'
}

// ───────────────────────── État global ─────────────────────────

export interface Preferences {
  univers: string
  ton: string
  style: string
  premisse: string
  envies: string
  refus: string
  romance: boolean
  violence: 'legere' | 'moderee' | 'sombre'
  difficulte: 'clemente' | 'normale' | 'rude'
  rythmeMystere: 'lent' | 'normal' | 'soutenu'
}

export interface StatsPartie {
  scenes: number
  jets: number
  jetsReussis: number
  critiques: number
  combats: number
  deductionsJustes: number
  motsEcrits: number
}

export interface GameState {
  version: number
  id: string
  hero: Hero
  monde: Monde
  preferences: Preferences
  personnages: Personnage[]
  factions: Faction[]
  lieux: Lieu[]
  lieuActuel: string
  journal: EntreeJournal[]
  hypotheses: Hypothese[]
  codex: EntreeCodex[]
  calendrier: Calendrier
  plan: PlanJour | null
  rythme: Rythme
  memoire: Memoire
  jetEnAttente: DemandeJet | null
  dernierJet: ResultatJet | null
  combat: Combat | null
  pistes: string[]
  succes: string[]
  stats: StatsPartie
  galerie: { id: string; titre: string; jour: number; humeur?: Humeur }[]
  /** Entraînements accumulés par statistique (un point tous les N entraînements). */
  entrainement: Partial<Record<StatId, number>>
  /** Le Metteur en scène estime que l'histoire peut se conclure. */
  finProposee: boolean
  termine: boolean
  epilogue?: string
}

// ───────────────────────── Scènes ─────────────────────────

export type Ligne =
  | { type: 'narration'; texte: string }
  | { type: 'replique'; personnage: string; personnageId?: string; expression: Expression; texte: string; chuchote: boolean }
  | { type: 'lieu'; nom: string }
  | { type: 'joueur'; texte: string }
  | { type: 'systeme'; texte: string }

export interface SceneResume {
  id: string
  parent: string | null
  index: number
  jour: number
  creneau: number
  lieu: string
  action: string
  prose: string
  lignes: Ligne[]
  creeLe: number
}

export interface NoeudSauvegarde {
  id: string
  parent: string | null
  index: number
  jour: number
  creneau: number
  lieu: string
  extrait: string
  creeLe: number
  surChemin: boolean
  marque?: string
}

export interface PartieResume {
  id: string
  titre: string
  univers: string
  hero: string
  jour: number
  scenes: number
  modifieLe: number
  creeLe: number
}

// ───────────────────────── Notifications ─────────────────────────

export interface Notification {
  genre: 'resonance' | 'reputation' | 'objet' | 'pv' | 'mana' | 'or' | 'etat' | 'journal' | 'palier' | 'succes' | 'codex' | 'info' | 'refus'
  texte: string
  delta?: number
  cible?: string
}

// ───────────────────────── Réglages ─────────────────────────

export type FournisseurTexte = 'mock' | 'anthropic' | 'ollama' | 'openai'
export type FournisseurImage = 'procedural' | 'comfyui' | 'a1111' | 'openai-images'

export interface ReglagesIA {
  fournisseur: FournisseurTexte
  /** Fournisseur distinct pour le modèle léger (ex. narration Claude, utilitaire Ollama). Vide = le même. */
  fournisseurLeger: FournisseurTexte | ''
  /** Modèles choisis pour chaque fournisseur : « grand » (narration, mise en scène) et « léger » (rapports, résumés). */
  modeles: Record<FournisseurTexte, { grand: string; leger: string }>
  effort: 'low' | 'medium' | 'high'
  ollamaUrl: string
  ollamaContexte: number
  openaiUrl: string
  /** Capacité du modèle servi par l'API compatible OpenAI : « petit » = consignes courtes. */
  openaiGabarit: 'grand' | 'petit'
  fenetre: 'econome' | 'equilibre' | 'riche'
  longueurScene: 'courte' | 'moyenne' | 'longue'
  gardien: 'off' | 'leger' | 'strict'
  cacheTtl: 'auto' | '5m' | '1h'
  vectoriseur: 'integre' | 'ollama'
  modeleVecteurs: string
}

export interface ReglagesImages {
  fournisseur: FournisseurImage
  comfyUrl: string
  comfyModele: string
  a1111Url: string
  openaiImagesUrl: string
  openaiImagesModele: string
  prechargement: boolean
  illustrations: boolean
  /** Coût estimé d'une image en ligne (USD), pour le tableau de bord. */
  coutEstime: number
}

export interface ReglagesAffichage {
  vitesseTexte: number
  auto: boolean
  delaiAuto: number
  taillePolice: number
  policeDyslexie: boolean
  contraste: boolean
  effets: boolean
  pistes: boolean
  pleinEcran: boolean
}

export interface ReglagesSon {
  musique: boolean
  volumeMusique: number
  effets: boolean
  volumeEffets: number
  voix: boolean
  volumeVoix: number
}

export interface ReglagesCouts {
  plafondSession: number
  plafondPartie: number
  alerte: boolean
}

export interface Reglages {
  ia: ReglagesIA
  images: ReglagesImages
  affichage: ReglagesAffichage
  son: ReglagesSon
  couts: ReglagesCouts
  dev: boolean
  langue: string
}

export const REGLAGES_DEFAUT: Reglages = {
  ia: {
    fournisseur: 'mock',
    fournisseurLeger: '',
    modeles: {
      mock: { grand: 'demo', leger: 'demo' },
      anthropic: { grand: 'claude-opus-5-5', leger: 'claude-haiku-5-5' },
      ollama: { grand: '', leger: '' },
      openai: { grand: '', leger: '' },
    },
    effort: 'low',
    ollamaUrl: 'http://127.0.0.1:11434',
    ollamaContexte: 8192,
    openaiUrl: 'http://127.0.0.1:1234/v1',
    openaiGabarit: 'petit',
    fenetre: 'equilibre',
    longueurScene: 'moyenne',
    gardien: 'leger',
    cacheTtl: 'auto',
    vectoriseur: 'integre',
    modeleVecteurs: 'bge-m3',
  },
  images: {
    fournisseur: 'procedural',
    comfyUrl: 'http://127.0.0.1:8188',
    comfyModele: '',
    a1111Url: 'http://127.0.0.1:7860',
    openaiImagesUrl: 'https://api.openai.com/v1',
    openaiImagesModele: 'gpt-image-1',
    prechargement: true,
    illustrations: true,
    coutEstime: 0.05,
  },
  affichage: {
    vitesseTexte: 45,
    auto: false,
    delaiAuto: 1800,
    taillePolice: 100,
    policeDyslexie: false,
    contraste: false,
    effets: true,
    pistes: true,
    pleinEcran: false,
  },
  son: {
    musique: true,
    volumeMusique: 0.35,
    effets: true,
    volumeEffets: 0.5,
    voix: false,
    volumeVoix: 0.8,
  },
  couts: {
    plafondSession: 2,
    plafondPartie: 20,
    alerte: true,
  },
  dev: false,
  langue: 'fr',
}

// ───────────────────────── Usage et coûts ─────────────────────────

export interface Usage {
  fournisseur: string
  modele: string
  role: string
  entree: number
  sortie: number
  cacheLecture: number
  cacheEcriture: number
  cout: number
}

export interface BilanCouts {
  session: number
  partie: number
  total: number
  parRole: { role: string; cout: number; appels: number; entree: number; sortie: number; cacheLecture: number }[]
  images: number
  tauxCache: number
  plafondSession: number
  plafondPartie: number
}

// ───────────────────────── Événements d'un tour ─────────────────────────

export type Phase =
  | 'repos' | 'narration' | 'rapport' | 'nuit' | 'plan' | 'monde' | 'image' | 'epilogue' | 'deduction'

export type EvenementTour =
  | { type: 'phase'; phase: Phase; detail?: string }
  | { type: 'delta'; texte: string }
  | { type: 'ligne'; ligne: Ligne }
  | { type: 'scene-finie'; sceneId: string }
  | { type: 'etat'; etat: GameState }
  | { type: 'notifications'; liste: Notification[] }
  | { type: 'jet'; demande: DemandeJet }
  | { type: 'jet-resultat'; resultat: ResultatJet }
  | { type: 'image'; cle: string; url: string }
  | { type: 'ambiance'; humeur: Humeur; effet?: 'tremblement' | 'flash' | 'fondu' | null; meteo?: 'pluie' | 'neige' | 'petales' | 'brume' | null }
  | { type: 'transition'; titre: string; sousTitre?: string }
  | { type: 'erreur'; erreur: ErreurIA }
  | { type: 'cout'; bilan: BilanCouts }

export interface ErreurIA {
  genre: 'cle' | 'reseau' | 'limite' | 'refus' | 'illisible' | 'surcharge' | 'annule' | 'plafond' | 'inconnu'
  message: string
  reessayable: boolean
  detail?: string
}

export interface EntreeJournalAppels {
  id: number
  quand: number
  role: string
  fournisseur: string
  modele: string
  dureeMs: number
  prompt: string
  reponse: string
  erreur?: string
  usage?: Usage
}
