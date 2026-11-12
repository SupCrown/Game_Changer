/**
 * Lecture de la prose du Narrateur.
 * Convention minimale (voir ARCHITECTURE.md §5). L'analyseur est tolérant :
 * une ligne qu'il ne comprend pas devient de la narration, jamais une erreur.
 */
import type { Expression, Ligne } from '@shared/types'
import { sansAccents } from './schemas'

const SYNONYMES: [RegExp, Expression][] = [
  [/souri|rire|rit|joie|joyeu|amus|malic|taquin|tendre|ravi|fier|fière|radieu|espieg|doux|douce|chaleur/, 'sourire'],
  [/col[eè]r|furi|agac|irrit|sec|seche|froid|glacial|mepris|menac|exasp|sévère|severe|dur|cassant|hautain/, 'colere'],
  [/gen|rougi|embarras|timid|troubl|confus|hesit|pudi|mal a l.aise|bafouill/, 'gene'],
  [/trist|larme|pleur|melancol|abatt|peine|douleur|las|lasse|amer|nostalg|inqui|soucieu|grave/, 'tristesse'],
  [/surpri|etonn|choc|choqu|stupef|interdit|sursaut|ebahi|incredul/, 'surprise'],
  [/neutre|calme|pose|impassible|serieu|pensi|songeu/, 'neutre'],
]

export function lireExpression(brut: string | undefined): { expression: Expression; chuchote: boolean } {
  const s = sansAccents(brut ?? '')
  const chuchote = /chuchot|murmur|a voix basse|souffl/.test(s)
  for (const [re, e] of SYNONYMES) if (re.test(s)) return { expression: e, chuchote }
  return { expression: 'neutre', chuchote }
}

export interface JetBrut { de: string; stat: string; difficulte: string; motif: string }

const RE_LIEU = /^\s*\[{1,2}\s*LIEU\s*:\s*([^\]|]+?)\s*(?:\|[^\]]*)?\]{1,2}\s*$/i
const RE_JET = /\[{1,2}\s*JET\s*:\s*([^\]]+?)\s*\]{1,2}/i
// Nom (expression) : « texte »   — l'expression OU un guillemet ouvrant est exigé pour éviter les faux positifs.
const RE_REPLIQUE = /^\s*(?:\*{1,2})?([A-ZÀ-ÖØ-Ý][\p{L}\p{M}'’. -]{0,38}?)(?:\*{1,2})?\s*(?:\(([^)]{1,40})\))?\s*:\s*(.+)$/u
const OUVRANTS = /^[*_]*\s*[«"“„‹]/

export function lireJet(texte: string): JetBrut | null {
  const m = RE_JET.exec(texte)
  if (!m) return null
  const champs = m[1].split('|').map((c) => c.trim()).filter(Boolean)
  if (champs.length < 2) return null
  let de = 'D20', stat = '', difficulte = '', motif = ''
  const reste: string[] = []
  for (const c of champs) {
    if (/^d\s?(20|100)$/i.test(c)) de = c.replace(/\s/g, '').toUpperCase()
    else if (!difficulte && /^(?:dd|difficult[ée]|seuil)?\s*:?\s*\d{1,3}$/i.test(c)) difficulte = c.replace(/\D/g, '')
    else reste.push(c)
  }
  if (reste.length) stat = reste.shift()!
  motif = reste.join(' — ')
  if (!motif) { motif = stat; }
  return { de, stat, difficulte, motif }
}

function nettoyerReplique(t: string): { texte: string; italique: boolean } {
  let s = t.trim()
  let italique = false
  const mi = /^([*_]{1,2})(.+?)\1$/.exec(s)
  if (mi) { italique = true; s = mi[2].trim() }
  s = s.replace(/^[«"“„‹]\s*/, '').replace(/\s*[»"”›]$/, '').trim()
  return { texte: s, italique }
}

/** Analyse une ligne terminée. Renvoie null pour une ligne vide ou purement décorative. */
export function analyserLigne(brute: string): Ligne | { type: 'jet'; jet: JetBrut } | null {
  const ligne = brute.replace(/\r/g, '').trim()
  if (!ligne || /^[-–—*_=~#\s]{3,}$/.test(ligne)) return null

  const lieu = RE_LIEU.exec(ligne)
  if (lieu) return { type: 'lieu', nom: lieu[1].trim() }

  const jet = lireJet(ligne)
  if (jet) {
    const avant = ligne.replace(RE_JET, '').trim()
    if (!avant) return { type: 'jet', jet }
  }

  const r = RE_REPLIQUE.exec(ligne)
  if (r) {
    const [, nom, expr, reste] = r
    const aGuillemet = OUVRANTS.test(reste)
    if ((expr || aGuillemet) && !/^(note|remarque|lieu|jet|rappel|resume|résumé)$/i.test(nom.trim())) {
      const { expression, chuchote } = lireExpression(expr)
      const { texte, italique } = nettoyerReplique(reste)
      if (texte) return { type: 'replique', personnage: nom.trim(), expression, texte, chuchote: chuchote || italique }
    }
  }
  // Titres Markdown égarés : on garde le texte, pas les dièses.
  return { type: 'narration', texte: ligne.replace(/^#{1,4}\s+/, '').replace(RE_JET, '').trim() }
}

export interface ProseAnalysee {
  lignes: Ligne[]
  jet: JetBrut | null
  lieu: string | null
  locuteurs: string[]
}

export function analyserProse(prose: string): ProseAnalysee {
  const lignes: Ligne[] = []
  let jet: JetBrut | null = null
  let lieu: string | null = null
  const locuteurs: string[] = []
  for (const brute of prose.split('\n')) {
    const l = analyserLigne(brute)
    if (!l) continue
    if (l.type === 'jet') { jet = l.jet; continue }
    if (l.type === 'narration') {
      const j = lireJet(brute)
      if (j) jet = j
      if (!l.texte) continue
    }
    if (l.type === 'lieu') lieu = l.nom
    if (l.type === 'replique') locuteurs.push(l.personnage)
    lignes.push(l)
  }
  return { lignes, jet, lieu, locuteurs }
}

/**
 * Découpe le flux de texte en lignes au fur et à mesure qu'il arrive.
 * `pousser` renvoie les lignes complètes ; `terminer` vide le reste.
 */
export class AnalyseurFlux {
  private tampon = ''
  texte = ''

  pousser(delta: string): Ligne[] {
    this.texte += delta
    this.tampon += delta
    const sorties: Ligne[] = []
    let i: number
    while ((i = this.tampon.indexOf('\n')) >= 0) {
      const ligne = this.tampon.slice(0, i)
      this.tampon = this.tampon.slice(i + 1)
      const l = analyserLigne(ligne)
      if (l && l.type !== 'jet' && !(l.type === 'narration' && !l.texte)) sorties.push(l)
    }
    return sorties
  }

  /** Texte de la ligne en cours d'écriture (affichage en direct). */
  get enCours(): string {
    return this.tampon
  }

  terminer(): Ligne[] {
    const l = analyserLigne(this.tampon)
    this.tampon = ''
    return l && l.type !== 'jet' && !(l.type === 'narration' && !l.texte) ? [l] : []
  }
}

/** Retire les balises techniques pour l'historique lisible et la synthèse vocale. */
export function proseLisible(prose: string): string {
  return prose.split('\n').filter((l) => !RE_LIEU.test(l)).map((l) => l.replace(RE_JET, '').trimEnd()).join('\n').trim()
}

export function estimerJetons(texte: string): number {
  return Math.ceil(texte.length / 3.4)
}
