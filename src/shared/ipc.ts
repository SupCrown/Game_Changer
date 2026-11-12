/**
 * Contrat entre l'interface (renderer) et le processus principal.
 * `FORME` décrit les espaces et méthodes ; le preload en fait des fonctions, le processus principal des gestionnaires.
 * Le renderer ne reçoit jamais une clé API : seulement sa forme masquée.
 */
import type {
  BilanCouts, EntreeJournalAppels, EvenementTour, GameState, NoeudSauvegarde, PartieResume, Preferences, Reglages, SceneResume, StatId,
} from './types'

export type NomCle = 'anthropic' | 'openai' | 'openai-images'

export interface UniversResume {
  id: string
  nom: string
  accroche: string
  description: string
  theme: string
  premisse: string
  tons: string[]
  emploiDuTemps: Record<string, string>
  evenements: { jour: number; nom: string; description: string }[]
}

export interface Instantane {
  etat: GameState
  historique: SceneResume[]
  bilan: BilanCouts
  rapportManquant: boolean
}

export interface Initial {
  version: string
  reglages: Reglages
  parties: PartieResume[]
  univers: UniversResume[]
  styles: { id: string; nom: string }[]
  cles: Record<NomCle, string | null>
  succes: { id: string; nom: string; description: string }[]
  chiffrementDisponible: boolean
  demo: boolean
}

export interface ResultatTest { ok: boolean; message: string; modeles?: string[] }

export type ActionCombatIpc =
  | { type: 'attaque'; cible: string }
  | { type: 'technique'; capacite: string; cible: string }
  | { type: 'defense' }
  | { type: 'fuite' }

export interface EntreeHerosIpc { prenom: string; age: number; forces: StatId[]; faiblesse: StatId | null }

export interface Api {
  app: {
    initial(): Promise<Initial>
    pleinEcran(actif: boolean): Promise<void>
    quitter(): Promise<void>
    ouvrirDossierDonnees(): Promise<void>
  }
  reglages: {
    ecrire(r: Reglages): Promise<Reglages>
    definirCle(nom: NomCle, valeur: string): Promise<string | null>
    supprimerCle(nom: NomCle): Promise<void>
    testerTexte(taille: 'grand' | 'leger'): Promise<ResultatTest>
    testerImages(): Promise<ResultatTest>
  }
  parties: {
    lister(): Promise<PartieResume[]>
    creer(preferences: Preferences, heros: EntreeHerosIpc): Promise<Instantane>
    ouvrir(id: string): Promise<Instantane>
    fermer(): Promise<void>
    supprimer(id: string): Promise<PartieResume[]>
    exporter(id: string): Promise<string | null>
    importer(): Promise<PartieResume[] | null>
  }
  jeu: {
    commencer(): Promise<void>
    jouer(texte: string, activite?: string): Promise<void>
    lancerDe(valeur: number | null): Promise<void>
    reessayer(): Promise<void>
    annuler(): Promise<void>
    avancerTemps(mode: 'creneau' | 'jour'): Promise<void>
    actionCombat(action: ActionCombatIpc, d20: number | null): Promise<void>
    deduire(indices: string[], hypothese: string): Promise<void>
    conclure(): Promise<void>
    refaire(): Promise<void>
    recommencer(): Promise<Instantane>
    revenirA(sceneId: string): Promise<Instantane>
    arbre(): Promise<NoeudSauvegarde[]>
    marquer(sceneId: string, marque: string | null): Promise<void>
    sauvegardeRapide(): Promise<void>
    instantane(): Promise<Instantane>
    preferences(p: Partial<Pick<Preferences, 'romance' | 'violence' | 'difficulte' | 'rythmeMystere'>>): Promise<GameState>
  }
  images: {
    obtenir(cle: string): Promise<{ url: string; provisoire: boolean } | null>
    regenerer(cle: string, prompt?: string): Promise<boolean>
    importer(cle: string): Promise<string | null>
    reinitialiser(cle: string): Promise<void>
    prompt(cle: string): Promise<string>
  }
  dev: {
    journal(): Promise<EntreeJournalAppels[]>
  }
}

export const FORME: { [E in keyof Api]: (keyof Api[E])[] } = {
  app: ['initial', 'pleinEcran', 'quitter', 'ouvrirDossierDonnees'],
  reglages: ['ecrire', 'definirCle', 'supprimerCle', 'testerTexte', 'testerImages'],
  parties: ['lister', 'creer', 'ouvrir', 'fermer', 'supprimer', 'exporter', 'importer'],
  jeu: ['commencer', 'jouer', 'lancerDe', 'reessayer', 'annuler', 'avancerTemps', 'actionCombat', 'deduire', 'conclure', 'refaire', 'recommencer', 'revenirA', 'arbre', 'marquer', 'sauvegardeRapide', 'instantane', 'preferences'],
  images: ['obtenir', 'regenerer', 'importer', 'reinitialiser', 'prompt'],
  dev: ['journal'],
}

export const CANAL_EVENEMENTS = 'resonance:evenement'

export type Pont = Api & { surEvenement(rappel: (e: EvenementTour) => void): () => void }

/** Résultat d'un appel : une erreur traverse l'IPC sous forme de données, jamais d'exception opaque. */
export type Reponse<T> = { ok: true; valeur: T } | { ok: false; message: string }
