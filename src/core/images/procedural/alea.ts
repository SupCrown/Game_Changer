/**
 * Hasard déterministe et utilitaires de couleur pour les images procédurales.
 * Aucune dépendance : ni DOM, ni Node.
 */

// ───────────────────────── Hasard à graine ─────────────────────────

export interface Alea {
  /** Nombre dans [0, 1). */
  n(): number
  /** Nombre dans [a, b). */
  entre(a: number, b: number): number
  /** Entier dans [a, b] (bornes incluses). */
  entier(a: number, b: number): number
  choix<T>(liste: readonly T[]): T
  chance(p: number): boolean
  /** -1 ou 1. */
  signe(): number
}

/** Ramène n'importe quel nombre à une graine entière non signée sur 32 bits. */
export function normaliserGraine(graine: number): number {
  if (!Number.isFinite(graine)) return 0
  return Math.floor(Math.abs(graine)) >>> 0
}

/** Générateur mulberry32. */
export function creerAlea(graine: number): Alea {
  let etat = normaliserGraine(graine)
  const n = (): number => {
    etat = (etat + 0x6d2b79f5) >>> 0
    let t = etat
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  // Quelques tirages à vide : les graines voisines divergent tout de suite.
  n()
  n()
  return {
    n,
    entre: (a, b) => a + (b - a) * n(),
    entier: (a, b) => Math.floor(a + (b - a + 1) * n()),
    choix: (liste) => liste[Math.min(liste.length - 1, Math.floor(n() * liste.length))],
    chance: (p) => n() < p,
    signe: () => (n() < 0.5 ? -1 : 1),
  }
}

/** Hachage FNV-1a d'un texte vers un entier non signé. */
export function hacher(texte: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Graine secondaire indépendante, pour qu'un détail ne décale pas le reste de la composition. */
export function deriver(graine: number, etiquette: string): number {
  return (Math.imul(normaliserGraine(graine) ^ 0x9e3779b9, 0x85ebca6b) ^ hacher(etiquette)) >>> 0
}

/** Préfixe d'identifiants unique par image (plusieurs SVG cohabitent dans la même page). */
export function prefixeId(genre: string, graine: number, variante: string): string {
  return genre + deriver(graine, variante).toString(36)
}

// ───────────────────────── Nombres et texte ─────────────────────────

/** Écrit un nombre de façon compacte (une décimale au plus), jamais NaN. */
export function nb(x: number): string {
  if (!Number.isFinite(x)) return '0'
  const r = Math.round(x * 10) / 10
  return Object.is(r, -0) ? '0' : String(r)
}

export function borner(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x
}

export function interpoler(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Échappe un texte pour l'insérer dans du SVG (contenu ou attribut). */
export function echapper(texte: string): string {
  return String(texte)
    // Caractères de contrôle interdits en XML.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ───────────────────────── Couleurs ─────────────────────────

export type Rvb = [number, number, number]

/** Lit une couleur hexadécimale (#rgb ou #rrggbb) ; renvoie `defaut` si elle est invalide. */
export function lireHex(texte: string | undefined, defaut: string): string {
  const t = (texte ?? '').trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(t)) return t
  if (/^#[0-9a-f]{3}$/.test(t)) return '#' + t[1] + t[1] + t[2] + t[2] + t[3] + t[3]
  if (/^#[0-9a-f]{8}$/.test(t)) return t.slice(0, 7)
  return defaut
}

export function versRvb(hex: string): Rvb {
  const h = lireHex(hex, '#808080')
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

export function versHex(r: number, v: number, b: number): string {
  const c = (x: number): string => Math.round(borner(x, 0, 255)).toString(16).padStart(2, '0')
  return '#' + c(r) + c(v) + c(b)
}

/** Teinte en degrés, saturation et luminosité en pourcentage. */
export function hsl(t: number, s: number, l: number): string {
  const teinte = (((t % 360) + 360) % 360) / 360
  const sat = borner(s, 0, 100) / 100
  const lum = borner(l, 0, 100) / 100
  if (sat === 0) return versHex(lum * 255, lum * 255, lum * 255)
  const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat
  const p = 2 * lum - q
  const canal = (x: number): number => {
    let k = x
    if (k < 0) k += 1
    if (k > 1) k -= 1
    if (k < 1 / 6) return p + (q - p) * 6 * k
    if (k < 1 / 2) return q
    if (k < 2 / 3) return p + (q - p) * (2 / 3 - k) * 6
    return p
  }
  return versHex(canal(teinte + 1 / 3) * 255, canal(teinte) * 255, canal(teinte - 1 / 3) * 255)
}

export function versHsl(hex: string): [number, number, number] {
  const [r, v, b] = versRvb(hex).map((x) => x / 255)
  const max = Math.max(r, v, b)
  const min = Math.min(r, v, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let t: number
  if (max === r) t = (v - b) / d + (v < b ? 6 : 0)
  else if (max === v) t = (b - r) / d + 2
  else t = (r - v) / d + 4
  return [t * 60, s * 100, l * 100]
}

/** Mélange linéaire : t = 0 donne a, t = 1 donne b. */
export function melanger(a: string, b: string, t: number): string {
  const x = versRvb(a)
  const y = versRvb(b)
  const k = borner(t, 0, 1)
  return versHex(x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k)
}

export function eclaircir(c: string, t: number): string {
  return melanger(c, '#ffffff', t)
}

export function assombrir(c: string, t: number): string {
  return melanger(c, '#000000', t)
}

/** Produit des deux couleurs (une lumière colorée qui tombe sur une surface). */
export function multiplier(a: string, b: string): string {
  const x = versRvb(a)
  const y = versRvb(b)
  return versHex((x[0] * y[0]) / 255, (x[1] * y[1]) / 255, (x[2] * y[2]) / 255)
}

/** Ajuste teinte (degrés), saturation et luminosité (points de pourcentage). */
export function ajuster(c: string, dTeinte: number, dSat: number, dLum: number): string {
  const [t, s, l] = versHsl(c)
  return hsl(t + dTeinte, s + dSat, l + dLum)
}

/** Luminosité perçue, entre 0 et 1. */
export function luminance(c: string): number {
  const [r, v, b] = versRvb(c)
  return (0.2126 * r + 0.7152 * v + 0.0722 * b) / 255
}

// ───────────────────────── Petits outils SVG ─────────────────────────

/** Opacité et autres valeurs fines : deux décimales. */
export function nb2(x: number): string {
  if (!Number.isFinite(x)) return '0'
  const r = Math.round(x * 100) / 100
  return Object.is(r, -0) ? '0' : String(r)
}

export function op(v: number): string {
  return v >= 1 ? '' : ` opacity="${nb2(Math.max(0, v))}"`
}

export function rect(x: number, y: number, l: number, h: number, fond: string, extra = ''): string {
  return `<rect x="${nb(x)}" y="${nb(y)}" width="${nb(Math.max(0, l))}" height="${nb(Math.max(0, h))}" fill="${fond}"${extra}/>`
}

export function chemin(d: string, fond: string, extra = ''): string {
  return `<path d="${d}" fill="${fond}"${extra}/>`
}

export function trait(d: string, couleur: string, epaisseur: number, extra = ''): string {
  return `<path d="${d}" fill="none" stroke="${couleur}" stroke-width="${nb(epaisseur)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`
}

export function cercle(cx: number, cy: number, r: number, fond: string, extra = ''): string {
  return `<circle cx="${nb(cx)}" cy="${nb(cy)}" r="${nb(Math.max(0, r))}" fill="${fond}"${extra}/>`
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, fond: string, extra = ''): string {
  return `<ellipse cx="${nb(cx)}" cy="${nb(cy)}" rx="${nb(Math.max(0, rx))}" ry="${nb(Math.max(0, ry))}" fill="${fond}"${extra}/>`
}

/** Tracé polygonal fermé à partir d'une liste x0, y0, x1, y1… */
export function pts(...c: number[]): string {
  let d = ''
  for (let i = 0; i + 1 < c.length; i += 2) d += (i === 0 ? 'M' : 'L') + nb(c[i]) + ' ' + nb(c[i + 1])
  return d + 'Z'
}

/** Tracé ouvert (pour les traits). */
export function ligne(...c: number[]): string {
  let d = ''
  for (let i = 0; i + 1 < c.length; i += 2) d += (i === 0 ? 'M' : 'L') + nb(c[i]) + ' ' + nb(c[i + 1])
  return d
}

/** Sous-tracé d'un disque, à concaténer dans un `d`. */
export function disque(cx: number, cy: number, r: number): string {
  return `M${nb(cx - r)} ${nb(cy)}a${nb(r)} ${nb(r)} 0 1 0 ${nb(2 * r)} 0a${nb(r)} ${nb(r)} 0 1 0 ${nb(-2 * r)} 0z`
}

/** Regroupe beaucoup de petits rectangles ou disques par couleur : un seul tracé par teinte. */
export class Lot {
  private readonly parCouleur = new Map<string, string>()

  rect(x: number, y: number, l: number, h: number, couleur: string): void {
    this.ajouter(couleur, `M${nb(x)} ${nb(y)}h${nb(l)}v${nb(h)}h${nb(-l)}z`)
  }

  disque(cx: number, cy: number, r: number, couleur: string): void {
    this.ajouter(couleur, disque(cx, cy, r))
  }

  ajouter(couleur: string, d: string): void {
    this.parCouleur.set(couleur, (this.parCouleur.get(couleur) ?? '') + d)
  }

  rendu(extra = ''): string {
    let s = ''
    for (const [couleur, d] of this.parCouleur) s += chemin(d, couleur, extra)
    return s
  }
}

export type Arret = [position: number, couleur: string, opacite?: number]

/** Réserve de dégradés et de découpes, avec des identifiants uniques par image. */
export class Toile {
  readonly defs: string[] = []
  readonly prefixe: string
  private compteur = 0
  private readonly halos = new Map<string, string>()

  constructor(prefixe: string) {
    this.prefixe = prefixe
  }

  id(): string {
    return this.prefixe + '-' + (this.compteur++).toString(36)
  }

  private arrets(liste: Arret[]): string {
    return liste
      .map(([p, c, o]) => `<stop offset="${nb2(p)}" stop-color="${c}"${o === undefined || o >= 1 ? '' : ` stop-opacity="${nb2(o)}"`}/>`)
      .join('')
  }

  /** Dégradé linéaire en coordonnées de l'image. */
  lineaire(x1: number, y1: number, x2: number, y2: number, liste: Arret[]): string {
    const id = this.id()
    this.defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${nb(x1)}" y1="${nb(y1)}" x2="${nb(x2)}" y2="${nb(y2)}">${this.arrets(liste)}</linearGradient>`,
    )
    return `url(#${id})`
  }

  /** Dégradé radial en coordonnées de l'image. */
  radial(cx: number, cy: number, r: number, liste: Arret[]): string {
    const id = this.id()
    this.defs.push(
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${nb(cx)}" cy="${nb(cy)}" r="${nb(r)}">${this.arrets(liste)}</radialGradient>`,
    )
    return `url(#${id})`
  }

  /** Halo doux réutilisable (relatif à la forme qui le porte). */
  halo(couleur: string): string {
    const connu = this.halos.get(couleur)
    if (connu) return connu
    const id = this.id()
    this.defs.push(
      `<radialGradient id="${id}">${this.arrets([[0, couleur, 1], [0.3, couleur, 0.5], [0.65, couleur, 0.14], [1, couleur, 0]])}</radialGradient>`,
    )
    const url = `url(#${id})`
    this.halos.set(couleur, url)
    return url
  }

  /** Découpe : renvoie l'attribut clip-path prêt à poser sur un groupe. */
  decoupe(formes: string): string {
    const id = this.id()
    this.defs.push(`<clipPath id="${id}">${formes}</clipPath>`)
    return ` clip-path="url(#${id})"`
  }

  /** Flou gaussien (à utiliser avec parcimonie). */
  flou(rayon: number): string {
    const id = this.id()
    this.defs.push(
      `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${nb(rayon)}"/></filter>`,
    )
    return ` filter="url(#${id})"`
  }

  rendu(): string {
    return this.defs.length ? `<defs>${this.defs.join('')}</defs>` : ''
  }
}
