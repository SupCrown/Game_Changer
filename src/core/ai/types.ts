/** Couche d'abstraction des fournisseurs de texte. */
import type { ZodType } from 'zod'
import type { ErreurIA, FournisseurTexte, Usage } from '@shared/types'

export interface BlocSysteme { texte: string; cache?: boolean }
export interface MessageIA { role: 'user' | 'assistant'; contenu: string; cache?: boolean }

export type Role =
  | 'narrateur' | 'greffier' | 'nuit' | 'metteur-en-scene' | 'monde' | 'chapitre' | 'deduction' | 'epilogue' | 'test'

export interface RequeteIA {
  role: Role
  modele: string
  systeme: BlocSysteme[]
  messages: MessageIA[]
  maxJetons: number
  effort?: 'low' | 'medium' | 'high'
  ttl?: '5m' | '1h'
  signal?: AbortSignal
  /** Informations hors prompt, utilisées par le fournisseur de démonstration. */
  meta?: Record<string, unknown>
}

export interface RequeteJson extends RequeteIA {
  schema: ZodType
  /** Rappel textuel du format attendu, pour les fournisseurs sans sortie contrainte. */
  aideFormat: string
}

export interface ReponseIA {
  texte: string
  usage: Usage
  arret: 'fin' | 'longueur'
}

export interface ReponseJson {
  donnees: unknown
  brut: string
  usage: Usage
}

export interface FournisseurIA {
  readonly id: FournisseurTexte
  /** « petit » : modèle local modeste → consignes courtes, contexte réduit. */
  readonly gabarit: 'grand' | 'petit'
  ecrire(req: RequeteIA, surDelta: (texte: string) => void): Promise<ReponseIA>
  structurer(req: RequeteJson): Promise<ReponseJson>
  tester(modele: string): Promise<{ ok: boolean; message: string; modeles?: string[] }>
}

export class ErreurFournisseur extends Error {
  readonly genre: ErreurIA['genre']
  readonly reessayable: boolean
  readonly detail?: string
  constructor(genre: ErreurIA['genre'], message: string, reessayable = true, detail?: string) {
    super(message)
    this.name = 'ErreurFournisseur'
    this.genre = genre
    this.reessayable = reessayable
    this.detail = detail
  }
  versErreurIA(): ErreurIA {
    return { genre: this.genre, message: this.message, reessayable: this.reessayable, detail: this.detail }
  }
}

export function versErreurIA(e: unknown): ErreurIA {
  if (e instanceof ErreurFournisseur) return e.versErreurIA()
  const detail = e instanceof Error ? e.message : String(e)
  return { genre: 'inconnu', message: 'Une erreur inattendue est survenue. Vous pouvez réessayer.', reessayable: true, detail }
}

/** Erreurs réseau de `fetch` (Ollama éteint, pas d'Internet…) → message lisible. */
export function erreurReseau(e: unknown, quoi: string): ErreurFournisseur {
  if (e instanceof ErreurFournisseur) return e
  if (e instanceof Error && (e.name === 'AbortError' || /aborted/i.test(e.message))) {
    return new ErreurFournisseur('annule', 'Génération interrompue.', true)
  }
  const detail = e instanceof Error ? `${e.message}${(e as any).cause?.code ? ` (${(e as any).cause.code})` : ''}` : String(e)
  return new ErreurFournisseur('reseau', `Impossible de joindre ${quoi}. Vérifiez qu'il est lancé et que l'adresse est correcte.`, true, detail)
}

/** Fusionne les messages consécutifs de même rôle (certains modèles locaux exigent une alternance stricte). */
export function fusionnerMessages(messages: MessageIA[]): { role: 'user' | 'assistant'; content: string }[] {
  const sortie: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of messages) {
    const dernier = sortie[sortie.length - 1]
    if (dernier && dernier.role === m.role) dernier.content += `

${m.contenu}`
    else sortie.push({ role: m.role, content: m.contenu })
  }
  return sortie
}

// ───────────────────────── Tarifs (USD par million de jetons) ─────────────────────────

interface Tarif { entree: number; sortie: number; lecture: number }

/** Tarifs publics Anthropic au 03/11/2026. Lecture de cache : prix du jeton lu. Écriture : 1,25× (5 min) ou 2× (1 h). */
const TARIFS: [RegExp, Tarif][] = [
  [/^claude-(fable|mythos)-5-2/, { entree: 8, sortie: 40, lecture: 0.2 }],
  [/^claude-(fable|mythos)-5/, { entree: 10, sortie: 50, lecture: 0.25 }],
  [/^claude-opus-5-5/, { entree: 4, sortie: 20, lecture: 0.2 }],
  [/^claude-opus-(5|4-[5678])/, { entree: 5, sortie: 25, lecture: 0.5 }],
  [/^claude-sonnet-5-5/, { entree: 2, sortie: 10, lecture: 0.1 }],
  [/^claude-sonnet-5/, { entree: 2, sortie: 10, lecture: 0.2 }],
  [/^claude-sonnet-4/, { entree: 3, sortie: 15, lecture: 0.3 }],
  [/^claude-haiku-5-5/, { entree: 0.1, sortie: 0.5, lecture: 0.01 }],
  [/^claude-haiku-4-5/, { entree: 1, sortie: 5, lecture: 0.1 }],
]

export function tarifDe(modele: string): Tarif | null {
  for (const [re, t] of TARIFS) if (re.test(modele)) return t
  return null
}

export function coutDe(modele: string, u: { entree: number; sortie: number; cacheLecture: number; cacheEcriture: number }, ttl: '5m' | '1h' = '5m'): number {
  const t = tarifDe(modele)
  if (!t) return 0
  const ecriture = t.entree * (ttl === '1h' ? 2 : 1.25)
  return (u.entree * t.entree + u.sortie * t.sortie + u.cacheLecture * t.lecture + u.cacheEcriture * ecriture) / 1_000_000
}

export function usageVide(fournisseur: string, modele: string, role: string): Usage {
  return { fournisseur, modele, role, entree: 0, sortie: 0, cacheLecture: 0, cacheEcriture: 0, cout: 0 }
}

/** Lit un flux HTTP ligne par ligne (NDJSON d'Ollama, SSE des API compatibles OpenAI). */
export async function* lireLignes(corps: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const lecteur = corps.getReader()
  const decodeur = new TextDecoder()
  let tampon = ''
  try {
    for (;;) {
      const { done, value } = await lecteur.read()
      if (done) break
      tampon += decodeur.decode(value, { stream: true })
      let i: number
      while ((i = tampon.indexOf('\n')) >= 0) {
        const ligne = tampon.slice(0, i).trim()
        tampon = tampon.slice(i + 1)
        if (ligne) yield ligne
      }
    }
    const reste = tampon.trim()
    if (reste) yield reste
  } finally {
    lecteur.releaseLock()
  }
}

/** Retire en continu les blocs <think>…</think> que certains modèles locaux écrivent dans leur réponse. */
export class FiltreReflexion {
  private dedans = false
  private tampon = ''
  filtrer(delta: string): string {
    this.tampon += delta
    let sortie = ''
    for (;;) {
      if (this.dedans) {
        const fin = this.tampon.indexOf('</think>')
        if (fin < 0) { this.tampon = this.tampon.slice(-8); return sortie }
        this.tampon = this.tampon.slice(fin + 8)
        this.dedans = false
      } else {
        const debut = this.tampon.indexOf('<think>')
        if (debut < 0) {
          // On garde les derniers caractères au cas où une balise serait coupée entre deux morceaux.
          const garde = this.tampon.lastIndexOf('<')
          if (garde >= 0 && this.tampon.length - garde < 7 && '<think>'.startsWith(this.tampon.slice(garde))) {
            sortie += this.tampon.slice(0, garde)
            this.tampon = this.tampon.slice(garde)
          } else {
            sortie += this.tampon
            this.tampon = ''
          }
          return sortie
        }
        sortie += this.tampon.slice(0, debut)
        this.tampon = this.tampon.slice(debut + 7)
        this.dedans = true
      }
    }
  }
  fin(): string {
    const r = this.dedans ? '' : this.tampon
    this.tampon = ''
    return r
  }
}
