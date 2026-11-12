/**
 * Recherche par similarité, locale.
 * - `VectoriseurIntegre` : n-grammes hachés (mots + paires de mots), hors ligne, instantané, gratuit.
 *   C'est une similarité lexicale : elle retrouve très bien « la dernière fois avec X », « la promesse »,
 *   un objet, un lieu. Elle ne comprend pas les synonymes.
 * - `VectoriseurOllama` : vecteurs sémantiques d'un modèle local (bge-m3, nomic-embed-text…), en option.
 * Les vecteurs sont stockés dans SQLite ; la comparaison est un simple balayage (quelques milliers
 * de passages au plus pour une partie entière : inutile d'ajouter une base vectorielle).
 */
import { sansAccents } from '@core/ai/schemas'

export interface Vectoriseur {
  readonly id: string
  vectoriser(textes: string[]): Promise<Float32Array[]>
}

const MOTS_VIDES = new Set(`a au aux avec ce ces cet cette comme dans de des du elle elles en et est etait eu il ils je la le les leur leurs lui ma mais me mes moi mon ne nos notre nous on ou par pas plus pour qu que qui sa sans se ses si son sur ta te tes toi ton tu un une vos votre vous y ete etre avoir fait dit tout tous toute toutes tres bien alors donc car ni cela ca c d j l m n s t`.split(' '))

export function motsCles(texte: string): string[] {
  return sansAccents(texte)
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 2 && !MOTS_VIDES.has(m))
    // Racine grossière : suffisante pour rapprocher pluriels et conjugaisons courantes.
    .map((m) => (m.length > 6 ? m.slice(0, 6) : m))
}

function hacher(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function normaliser(v: Float32Array): Float32Array {
  let n = 0
  for (let i = 0; i < v.length; i++) n += v[i] * v[i]
  n = Math.sqrt(n)
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n
  return v
}

export class VectoriseurIntegre implements Vectoriseur {
  readonly id = 'integre-v1'
  constructor(private dimension = 768) {}

  vecteur(texte: string): Float32Array {
    const v = new Float32Array(this.dimension)
    const mots = motsCles(texte)
    const compte = new Map<string, number>()
    const ajouter = (cle: string, poids: number) => compte.set(cle, (compte.get(cle) ?? 0) + poids)
    for (let i = 0; i < mots.length; i++) {
      ajouter(mots[i], 1)
      if (i + 1 < mots.length) ajouter(`${mots[i]}_${mots[i + 1]}`, 0.6)
    }
    for (const [cle, n] of compte) {
      const h = hacher(cle)
      const signe = h & 1 ? 1 : -1
      v[(h >>> 1) % this.dimension] += signe * Math.sqrt(n)
    }
    return normaliser(v)
  }

  async vectoriser(textes: string[]): Promise<Float32Array[]> {
    return textes.map((t) => this.vecteur(t))
  }
}

export class VectoriseurOllama implements Vectoriseur {
  readonly id: string
  constructor(private appel: (modele: string, textes: string[]) => Promise<number[][]>, private modele: string) {
    this.id = `ollama-${modele}`
  }
  async vectoriser(textes: string[]): Promise<Float32Array[]> {
    const brut = await this.appel(this.modele, textes)
    return brut.map((v) => normaliser(Float32Array.from(v)))
  }
}

export function similarite(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** Découpe une scène en passages d'environ `taille` caractères, sans couper les paragraphes. */
export function decouper(texte: string, taille = 700): string[] {
  const paragraphes = texte.split(/\n+/).map((p) => p.trim()).filter(Boolean)
  const passages: string[] = []
  let courant = ''
  for (const p of paragraphes) {
    if (courant && courant.length + p.length > taille) {
      passages.push(courant)
      courant = ''
    }
    courant = courant ? `${courant}\n${p}` : p
    while (courant.length > taille * 1.6) {
      passages.push(courant.slice(0, taille))
      courant = courant.slice(taille)
    }
  }
  if (courant) passages.push(courant)
  return passages
}

export interface Souvenir {
  sceneId: string
  indexScene: number
  jour: number
  texte: string
  vecteur: Float32Array
}

/**
 * Les `k` passages les plus proches de la requête, parmi les scènes antérieures à `avantIndex`
 * (celles qui ne sont plus envoyées en entier). Un passage par scène au plus, pour varier.
 */
export function retrouver(requete: Float32Array, souvenirs: Souvenir[], k: number, avantIndex: number, seuil = 0.12): Souvenir[] {
  const notes = souvenirs
    .filter((s) => s.indexScene < avantIndex)
    .map((s) => ({ s, score: similarite(requete, s.vecteur) }))
    .filter((x) => x.score >= seuil)
    .sort((a, b) => b.score - a.score)
  const vus = new Set<string>()
  const choisis: Souvenir[] = []
  for (const { s } of notes) {
    if (vus.has(s.sceneId)) continue
    vus.add(s.sceneId)
    choisis.push(s)
    if (choisis.length >= k) break
  }
  return choisis.sort((a, b) => a.indexScene - b.indexScene)
}

export function versBlob(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength))
}

export function depuisBlob(b: Uint8Array): Float32Array {
  const copie = new Uint8Array(b.byteLength)
  copie.set(b)
  return new Float32Array(copie.buffer)
}
