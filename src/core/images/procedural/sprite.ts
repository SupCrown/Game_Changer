/**
 * Sprites procéduraux : personnage adulte, entièrement habillé, en buste (jusqu'à mi-cuisse),
 * 600×900, fond transparent. Le personnage dépend de (graine, couleur, apparence, thème) ;
 * l'expression ne change que le groupe « visage ».
 */
import type { Expression } from '@shared/types'
import type { ThemeArt } from './decor'
import {
  type Alea, Toile, ajuster, assombrir, cercle, chemin, creerAlea, deriver, disque, eclaircir, ellipse,
  ligne, lireHex, luminance, melanger, multiplier, nb, op, prefixeId, pts, rect, trait,
} from './alea'

const LG = 600
const HT = 900
const CX = 300

// ───────────────────────── Lecture de l'apparence ─────────────────────────

export type Coiffure = 'longs' | 'ondules' | 'carre' | 'milongs' | 'queue' | 'tresse' | 'chignon' | 'courts'
export type TeinteCheveux = 'blond' | 'noir' | 'roux' | 'argent' | 'blanc' | 'brun' | 'rose' | 'bleu' | 'violet' | 'vert' | 'rouge'
export type TeinteYeux = 'bleu' | 'vert' | 'dore' | 'gris' | 'violet' | 'brun' | 'rouge' | 'noir'
export type TeintePeau = 'pale' | 'claire' | 'mate' | 'sombre'

/** Ce que la description impose ; le reste vient de la graine. */
export interface Indices {
  masculin?: boolean
  cheveux?: TeinteCheveux
  longueur?: 'longs' | 'milongs' | 'courts'
  coiffure?: Coiffure
  yeux?: TeinteYeux
  peau?: TeintePeau
  lunettes?: boolean
  barbe?: boolean
}

type Ancre = 'cheveux' | 'yeux' | 'peau'
type Nuance = TeinteCheveux | 'dore' | 'pale' | 'mate' | 'sombre'

const ANCRES: [RegExp, Ancre][] = [
  [/^(cheveu|chevelure|meche|tresse|natte|chignon|boucle|criniere|tignasse|frange|couette|toison|coiffure|barbe|moustache)/, 'cheveux'],
  [/^(yeux|oeil|regard|iris|prunelle|pupille)/, 'yeux'],
  [/^(peau|teint|carnation)$/, 'peau'],
]

const NUANCES: [RegExp, Nuance][] = [
  [/^(blond|platine|paille|miel)/, 'blond'],
  [/^(noir|jais|corbeau|ebene|encre)/, 'noir'],
  [/^(roux|rouss|cuivr|auburn|flamboy|rouquin)/, 'roux'],
  [/^(argent|gris|cendr|acier)/, 'argent'],
  [/^(blanc|neige|immacul|ivoire)/, 'blanc'],
  [/^(brun|chatain|marron|chocolat|noisette)/, 'brun'],
  [/^rose/, 'rose'],
  [/^(bleu|azur|saphir|turquoise|cyan|indigo)/, 'bleu'],
  [/^(violet|mauve|lavande|amethyste|pourpre|lilas|violine)/, 'violet'],
  [/^(verts?|vertes?|emeraude|jade)$/, 'vert'],
  [/^(rouge|rubis|carmin|ecarlate|cramoisi|vermeil|grenat)/, 'rouge'],
  [/^(dore|ambre|or$|jaune|topaze)/, 'dore'],
  [/^(pale|diaphane|porcelaine|laiteu|blafard|albatre|opalin|livide)/, 'pale'],
  [/^(mate?s?$|hale|bronze|basane|caramel|olivatre|tanne)/, 'mate'],
  [/^(sombre|fonce)/, 'sombre'],
]

function trouver<T>(table: [RegExp, T][], mot: string): T | undefined {
  for (const [motif, valeur] of table) if (motif.test(mot)) return valeur
  return undefined
}

const PONCTUATION = /^[.,;:!?()]$/

/** Analyse par mots-clés d'une description française libre. */
export function lireApparence(texte: string | undefined): Indices {
  const ind: Indices = {}
  if (!texte) return ind
  const brut = texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/mi[\s-]+long/g, 'milong')
    .replace(/[^a-z.,;:!?()]+/g, ' ')
  const jetons = brut.match(/[a-z]+|[.,;:!?()]/g) ?? []
  const ancres = jetons.map((j) => trouver(ANCRES, j))

  /** Ancre la plus proche d'un mot : d'abord avant lui (l'adjectif suit le nom), sinon juste après. */
  const ancreDe = (i: number): { ancre: Ancre; distance: number; apres?: boolean } | undefined => {
    let d = 0
    for (let j = i - 1; j >= 0 && d < 7; j--) {
      const jeton = jetons[j]
      if (jeton === ',') { d += 2; continue }
      if (PONCTUATION.test(jeton)) break
      d++
      if (ancres[j]) return { ancre: ancres[j] as Ancre, distance: d }
    }
    for (let j = i + 1; j < jetons.length && j <= i + 3; j++) {
      if (PONCTUATION.test(jetons[j])) break
      if (ancres[j]) return { ancre: ancres[j] as Ancre, distance: j - i, apres: true }
    }
    return undefined
  }

  let feminin = false
  for (let i = 0; i < jetons.length; i++) {
    const mot = jetons[i]
    if (PONCTUATION.test(mot)) continue

    if (/^(homme|il|monsieur|masculin|garcon|barbu|moustachu|viril)$/.test(mot)) ind.masculin = true
    if (/^(femme|elle|dame|demoiselle|feminine?|madame)$/.test(mot)) feminin = true
    if (/^(lunettes?|binocles?|monocle|besicles)$/.test(mot)) ind.lunettes = true
    if (/^(barbe|barbu|moustach|bouc$)/.test(mot)) ind.barbe = true

    if (/^(tresse|natte)/.test(mot)) ind.coiffure ??= 'tresse'
    else if (/^chignon/.test(mot)) ind.coiffure ??= 'chignon'
    else if (/^(couette|catogan)/.test(mot) || (mot === 'queue' && jetons.slice(i + 1, i + 4).includes('cheval'))) ind.coiffure ??= 'queue'
    else if (/^(ondul|boucl|fris|vagues?$)/.test(mot)) ind.coiffure ??= 'ondules'
    else if (mot === 'carre' && (ancreDe(i)?.ancre === 'cheveux' || jetons[i - 1] === 'au' || jetons[i - 1] === 'coupe')) ind.coiffure ??= 'carre'

    if (mot.startsWith('milong')) ind.longueur ??= 'milongs'
    else if (/^(longs?|longues?)$/.test(mot) && ancreDe(i)?.ancre === 'cheveux') ind.longueur ??= 'longs'
    else if (/^(courts?|courtes?|ras|rases?)$/.test(mot) && ancreDe(i)?.ancre === 'cheveux') ind.longueur ??= 'courts'

    const nuance = trouver(NUANCES, mot)
    if (!nuance) continue
    const proche = ancreDe(i)
    const dePeau = nuance === 'pale' || nuance === 'mate' || nuance === 'sombre'
    // « pâle », « mate »… parlent de la peau, sauf collés à un autre nom (« yeux pâles »).
    const ancre: Ancre | undefined = dePeau && proche && proche.ancre !== 'peau' && (proche.distance > 2 || proche.apres) ? 'peau' : proche?.ancre

    if (ancre === 'cheveux') {
      if (nuance === 'dore' || nuance === 'pale') ind.cheveux ??= 'blond'
      else if (nuance === 'sombre') ind.cheveux ??= 'noir'
      else if (nuance !== 'mate') ind.cheveux ??= nuance
    } else if (ancre === 'yeux') {
      if (nuance === 'argent' || nuance === 'pale' || nuance === 'blanc') ind.yeux ??= 'gris'
      else if (nuance === 'sombre') ind.yeux ??= 'noir'
      else if (nuance === 'roux') ind.yeux ??= 'dore'
      else if (nuance === 'rose') ind.yeux ??= 'violet'
      else if (nuance !== 'blond' && nuance !== 'mate') ind.yeux ??= nuance
    } else if (ancre === 'peau') {
      if (nuance === 'pale' || nuance === 'blanc') ind.peau ??= 'pale'
      else if (nuance === 'mate' || nuance === 'dore' || nuance === 'roux' || nuance === 'brun') ind.peau ??= 'mate'
      else if (nuance === 'sombre' || nuance === 'noir') ind.peau ??= 'sombre'
    } else if (dePeau) {
      ind.peau ??= nuance
    } else if (/^(blond|rouss|roux|rouquin|brune?s?$|chatain|auburn)/.test(mot)) {
      // « une blonde », « un grand roux » : la couleur désigne les cheveux.
      ind.cheveux ??= nuance as TeinteCheveux
    }
  }
  if (feminin && !/\b(homme|monsieur)\b/.test(brut)) delete ind.masculin
  return ind
}

// ───────────────────────── Palettes ─────────────────────────

const CHEVEUX: Record<TeinteCheveux, string> = {
  blond: '#e6c46c', noir: '#262330', roux: '#b9552c', argent: '#b4b8c8', blanc: '#eeeef3', brun: '#6c4832',
  rose: '#e78fb3', bleu: '#4b7bcc', violet: '#7d58b8', vert: '#4f9c70', rouge: '#b2303c',
}

const YEUX: Record<TeinteYeux, string> = {
  bleu: '#3f86d8', vert: '#3fa066', dore: '#dc9c28', gris: '#8792a6', violet: '#8d5bd0', brun: '#84502c', rouge: '#cc3340', noir: '#40343a',
}

const PEAUX: Record<TeintePeau, string[]> = {
  pale: ['#fdeee4', '#fbe8dc'],
  claire: ['#f8dcc8', '#f3d3ba', '#f0cdb0'],
  mate: ['#dfae88', '#d39f78', '#c8946c'],
  sombre: ['#99684a', '#84573c', '#6f4733'],
}

type Tenue = 'uniforme' | 'robe' | 'manteau' | 'cape' | 'kimono' | 'gilet' | 'veste'

interface Garde { tenues: Tenue[]; bases: string[]; secondes: string[]; clair: string; metal: string; cheveux: TeinteCheveux[] }

const NATURELS: TeinteCheveux[] = ['noir', 'brun', 'brun', 'blond', 'roux', 'noir']

const GARDES: Record<ThemeArt, Garde> = {
  fantasy: {
    tenues: ['uniforme', 'robe', 'cape', 'manteau', 'cape', 'robe'],
    bases: ['#2f3f66', '#6d2838', '#2f5448', '#4b3562', '#3a4a5c'], secondes: ['#3b3f52', '#5a4636', '#2e3344', '#6a5a48'],
    clair: '#f4efe4', metal: '#d0a850', cheveux: [...NATURELS, 'argent', 'blanc', 'rose', 'bleu', 'violet', 'vert'],
  },
  gothique: {
    tenues: ['robe', 'manteau', 'cape', 'uniforme', 'robe', 'manteau'],
    bases: ['#22202e', '#3d2030', '#2b303f', '#43324d', '#1f2a2c'], secondes: ['#34303f', '#2a2630', '#4a2a36', '#3a3a48'],
    clair: '#e6e0ea', metal: '#aeaec0', cheveux: [...NATURELS, 'noir', 'noir', 'blanc', 'argent', 'violet', 'rouge'],
  },
  orientale: {
    tenues: ['kimono', 'kimono', 'kimono', 'robe', 'manteau', 'kimono'],
    bases: ['#b8443c', '#2f506d', '#3f6d5c', '#5c3b6d', '#394456', '#c98a3a'], secondes: ['#e9dcbc', '#2d3140', '#6e2c30', '#3c4f48'],
    clair: '#f6f0e2', metal: '#d8b45e', cheveux: [...NATURELS, 'noir', 'noir', 'brun', 'blanc', 'argent', 'bleu'],
  },
  steampunk: {
    tenues: ['gilet', 'gilet', 'manteau', 'uniforme', 'robe', 'gilet'],
    bases: ['#5c3c2a', '#3e4b46', '#6d4b30', '#4b3035', '#394252'], secondes: ['#3a2f2a', '#4a3a30', '#2e3438', '#5a4a3a'],
    clair: '#efe5cf', metal: '#c08240', cheveux: [...NATURELS, 'roux', 'brun', 'blond', 'argent', 'rouge'],
  },
  moderne: {
    tenues: ['veste', 'veste', 'uniforme', 'manteau', 'robe', 'veste'],
    bases: ['#2c3441', '#5b6c7b', '#7b4b4c', '#3a514b', '#bfae96', '#394a6a'], secondes: ['#2a2d35', '#3c4450', '#4a4038', '#2f3a48'],
    clair: '#f3f0ea', metal: '#aab2bd', cheveux: [...NATURELS, 'noir', 'brun', 'blond', 'rose', 'bleu', 'argent'],
  },
  libre: {
    tenues: ['uniforme', 'robe', 'manteau', 'cape', 'kimono', 'gilet', 'veste'],
    bases: ['#2f3f66', '#6d2838', '#2f5448', '#4b3562', '#2c3441', '#5c3c2a'], secondes: ['#3b3f52', '#5a4636', '#2e3344', '#3c4450'],
    clair: '#f4efe4', metal: '#c9ac6a', cheveux: [...NATURELS, 'argent', 'blanc', 'rose', 'bleu', 'violet', 'vert', 'rouge'],
  },
}

// ───────────────────────── Personnage ─────────────────────────

interface Morpho { m: boolean; ep: number; cou: number; poi: number; tai: number; han: number; bras: number }

type Frange = 'droite' | 'cote' | 'milieu' | 'degagee'
type Visage = 'ovale' | 'fin' | 'carre' | 'rond'

interface Perso {
  g: Morpho
  theme: ThemeArt
  tenue: Tenue
  coiffure: Coiffure
  frange: Frange
  cote: 1 | -1
  visage: Visage
  peau: string
  ombrePeau: string
  cheveux: string
  yeux: string
  accent: string
  base: string
  seconde: string
  clair: string
  metal: string
  lunettes: boolean
  barbe: boolean
  pantalon: boolean
  boucles: boolean
  ornement: number
  grain: boolean
  lunettesRondes: boolean
  variante: number
}

function creerPerso(o: { graine: number; couleur: string; apparence?: string; theme: ThemeArt }): Perso {
  const theme: ThemeArt = o.theme in GARDES ? o.theme : 'libre'
  const garde = GARDES[theme]
  const ind = lireApparence(o.apparence)
  // Tous les tirages sont faits dans un ordre fixe : une description ne décale pas le reste.
  const a = creerAlea(deriver(o.graine, 'sprite'))
  const t = {
    masculin: false,
    cheveux: a.choix(garde.cheveux),
    coiffure: a.choix<Coiffure>(['longs', 'ondules', 'carre', 'queue', 'tresse', 'chignon', 'courts', 'milongs', 'longs', 'queue']),
    coiffureM: a.choix<Coiffure>(['courts', 'courts', 'courts', 'milongs', 'queue', 'courts']),
    frange: a.choix<Frange>(['droite', 'cote', 'cote', 'milieu', 'degagee']),
    cote: a.signe() as 1 | -1,
    visage: a.choix<Visage>(['ovale', 'ovale', 'fin', 'carre', 'rond']),
    yeux: a.choix<TeinteYeux>(['bleu', 'vert', 'brun', 'brun', 'gris', 'dore', 'violet', 'noir']),
    peau: a.choix<TeintePeau>(['pale', 'claire', 'claire', 'claire', 'mate', 'mate', 'sombre']),
    nuancePeau: a.n(),
    tenue: a.choix(garde.tenues),
    base: a.choix(garde.bases),
    seconde: a.choix(garde.secondes),
    lunettes: a.chance(0.1),
    pantalon: a.chance(0.35),
    boucles: a.chance(0.55),
    ornement: a.entier(0, 3),
    grain: a.chance(0.25),
    carrure: a.entre(-1, 1),
    lunettesRondes: a.chance(0.5),
    variante: a.entier(0, 99),
    barbe: a.chance(0.25),
  }
  const m = ind.masculin ?? t.masculin
  const k = 1 + t.carrure * 0.03
  const g: Morpho = m
    ? { m, ep: 146 * k, cou: 28, poi: 106 * k, tai: 90 * k, han: 97, bras: 52 }
    : { m, ep: 116 * k, cou: 20, poi: 82 * k, tai: 61 * k, han: 95, bras: 40 }

  let coiffure: Coiffure = m ? t.coiffureM : t.coiffure
  if (ind.coiffure) coiffure = ind.coiffure
  if (ind.longueur === 'courts') coiffure = ind.coiffure === 'chignon' ? 'chignon' : 'courts'
  else if (ind.longueur === 'milongs' && !ind.coiffure) coiffure = 'milongs'
  else if (ind.longueur === 'longs' && !ind.coiffure) coiffure = coiffure === 'ondules' || coiffure === 'longs' ? coiffure : 'longs'

  let frange = t.frange
  if (m && frange === 'droite') frange = 'cote'
  let tenue = t.tenue
  if (m && tenue === 'robe') tenue = theme === 'orientale' ? 'kimono' : 'manteau'

  const peaux = PEAUX[ind.peau ?? t.peau]
  const peau = peaux[Math.min(peaux.length - 1, Math.floor(t.nuancePeau * peaux.length))]
  const accent = lireHex(o.couleur, GARDES.libre.bases[t.variante % GARDES.libre.bases.length])
  let base = t.base
  // La tenue ne doit pas se confondre avec la couleur d'accent.
  const ecart = (x: string, y: string): number => Math.abs(luminance(x) - luminance(y))
  if (ecart(base, accent) < 0.07) base = luminance(base) > 0.35 ? assombrir(base, 0.4) : eclaircir(base, 0.22)

  return {
    g, theme, tenue, coiffure, frange, cote: t.cote, visage: t.visage,
    peau, ombrePeau: melanger(multiplier(peau, '#e9b3a0'), '#7a3f3a', 0.12),
    cheveux: CHEVEUX[ind.cheveux ?? t.cheveux],
    yeux: YEUX[ind.yeux ?? t.yeux],
    accent, base, seconde: t.seconde, clair: garde.clair, metal: garde.metal,
    lunettes: ind.lunettes ?? t.lunettes,
    barbe: m && (ind.barbe ?? t.barbe),
    pantalon: m || t.pantalon,
    boucles: !m && t.boucles,
    ornement: t.ornement,
    grain: t.grain,
    lunettesRondes: t.lunettesRondes,
    variante: t.variante,
  }
}

// ───────────────────────── Corps ─────────────────────────

const fonce = (c: string, t = 0.22): string => assombrir(c, t)
const vif = (c: string, t = 0.14): string => eclaircir(c, t)

/** Contour du buste, des épaules jusqu'à yBas (≥ 640), large de lBas en bas. */
function torse(g: Morpho, yBas: number, lBas: number): string {
  const c = CX
  const cote = (s: number): string[] => [
    `${nb(c + s * (g.ep - 4))} 314`,
    `${nb(c + s * (g.ep - 24))} 372`,
    `${nb(c + s * (g.poi + 3))} 392 ${nb(c + s * g.poi)} 430 ${nb(c + s * (g.poi - 4))} 452`,
    `${nb(c + s * (g.tai + 4))} 482 ${nb(c + s * g.tai)} 500 ${nb(c + s * g.tai)} 518`,
    `${nb(c + s * g.tai)} 562 ${nb(c + s * g.han)} 590 ${nb(c + s * g.han)} 640`,
  ]
  const [e1, a1, p1, t1, h1] = cote(-1)
  // Côté gauche en descendant, puis côté droit en remontant (courbes inversées).
  return `M${nb(c - g.cou - 10)} 288Q${nb(c - g.ep * 0.62)} 291 ${e1}L${a1}C${p1}C${t1}C${h1}L${nb(c - lBas)} ${nb(yBas)}L${nb(c + lBas)} ${nb(yBas)}`
    + `L${nb(c + g.han)} 640C${nb(c + g.han)} 590 ${nb(c + g.tai)} 562 ${nb(c + g.tai)} 518C${nb(c + g.tai)} 500 ${nb(c + g.tai + 4)} 482 ${nb(c + g.poi - 4)} 452`
    + `C${nb(c + g.poi)} 430 ${nb(c + g.poi + 3)} 392 ${nb(c + g.ep - 24)} 372L${nb(c + g.ep - 4)} 314Q${nb(c + g.ep * 0.62)} 291 ${nb(c + g.cou + 10)} 288Z`
}

/** Manche : s = -1 à gauche de l'image, 1 à droite. */
function manche(g: Morpho, s: number, evase = 0, yFin = 716, bouffant = 0): string {
  const xo = CX + s * g.ep
  const w = g.bras
  return `M${nb(xo - s * 36)} 294Q${nb(xo + s * (2 + bouffant))} 292 ${nb(xo + s * (7 + bouffant))} 340`
    + `C${nb(xo + s * (11 + bouffant))} 420 ${nb(xo + s * 9)} 480 ${nb(xo + s * 6)} 525`
    + `L${nb(xo + s * (evase - 3))} ${nb(yFin)}L${nb(xo - s * (3 + w * 0.8 + evase * 0.4))} ${nb(yFin)}`
    + `L${nb(xo - s * (w - 3))} 525L${nb(xo - s * (w - 6))} 372Z`
}

function poignet(g: Morpho, s: number): number {
  return CX + s * g.ep - s * (3 + g.bras * 0.4)
}

function main(p: Perso, s: number, y = 712): string {
  const x = poignet(p.g, s)
  const l = p.g.m ? 19 : 15.5
  const h = p.g.m ? 70 : 64
  let o = chemin(
    `M${nb(x - l)} ${y}C${nb(x - l - 2)} ${nb(y + h * 0.4)} ${nb(x - l)} ${nb(y + h * 0.72)} ${nb(x - l * 0.5)} ${nb(y + h * 0.94)}Q${nb(x)} ${nb(y + h * 1.06)} ${nb(x + l * 0.5)} ${nb(y + h * 0.94)}C${nb(x + l)} ${nb(y + h * 0.72)} ${nb(x + l + 2)} ${nb(y + h * 0.4)} ${nb(x + l)} ${y}Z`,
    p.peau,
  )
  // Pouce, tourné vers le corps.
  o += chemin(`M${nb(x - s * l * 0.8)} ${nb(y + 6)}Q${nb(x - s * (l + 9))} ${nb(y + h * 0.3)} ${nb(x - s * (l + 3))} ${nb(y + h * 0.56)}Q${nb(x - s * l * 0.7)} ${nb(y + h * 0.5)} ${nb(x - s * l * 0.6)} ${nb(y + h * 0.3)}Z`, p.peau)
  o += trait(ligne(x - l * 0.2, y + h * 0.66, x - l * 0.25, y + h * 0.94) + ligne(x + l * 0.25, y + h * 0.66, x + l * 0.2, y + h * 0.94), p.ombrePeau, 1.6, op(0.6))
  return o
}

function jupe(g: Morpho, yT: number, lBas: number, couleur: string, plis: number): string {
  const c = CX
  let o = chemin(
    `M${nb(c - g.tai - 3)} ${yT}C${nb(c - g.han - 6)} ${yT + 70} ${nb(c - g.han - 12)} 650 ${nb(c - lBas)} ${HT}L${nb(c + lBas)} ${HT}C${nb(c + g.han + 12)} 650 ${nb(c + g.han + 6)} ${yT + 70} ${nb(c + g.tai + 3)} ${yT}Z`,
    couleur,
  )
  let d = ''
  for (let i = 1; i < plis; i++) {
    const k = i / plis - 0.5
    d += `M${nb(c + k * g.tai * 1.7)} ${yT + 26}Q${nb(c + k * g.han * 2)} ${nb((yT + HT) / 2)} ${nb(c + k * lBas * 1.9)} ${HT}`
  }
  if (d) o += trait(d, fonce(couleur, 0.3), 3, op(0.7))
  return o
}

function pantalon(g: Morpho, yT: number, couleur: string): string {
  const c = CX
  const o = chemin(
    `M${nb(c - g.tai - 2)} ${yT}C${nb(c - g.han)} ${yT + 60} ${nb(c - g.han - 3)} 650 ${nb(c - g.han - 3)} 720L${nb(c - g.han + 3)} ${HT}L${nb(c - 9)} ${HT}L${nb(c - 2)} 742L${nb(c + 2)} 742L${nb(c + 9)} ${HT}L${nb(c + g.han - 3)} ${HT}L${nb(c + g.han + 3)} 720C${nb(c + g.han + 3)} 650 ${nb(c + g.han)} ${yT + 60} ${nb(c + g.tai + 2)} ${yT}Z`,
    couleur,
  )
  return o + trait(`M${c} ${yT + 12}V742M${nb(c - g.han * 0.5)} 760V${HT}M${nb(c + g.han * 0.5)} 760V${HT}`, fonce(couleur, 0.35), 2.5, op(0.6))
}

/** Bas de tenue : jupe plissée ou pantalon. */
function bas(p: Perso, yT: number, couleur: string): string {
  return p.pantalon ? pantalon(p.g, yT, couleur) : jupe(p.g, yT, p.g.han + 38, couleur, 7)
}

function boutons(xs: number[], y0: number, y1: number, n: number, couleur: string, r = 5.5): string {
  let d = ''
  for (const x of xs) for (let i = 0; i < n; i++) d += disque(x, n === 1 ? y0 : y0 + ((y1 - y0) * i) / (n - 1), r)
  return chemin(d, couleur)
}

/** Ombre portée sur le côté droit, découpée sur la silhouette. */
function ombreLaterale(t: Toile, silhouette: string, g: Morpho, force = 0.1): string {
  const c = CX
  const d = `M${nb(c + g.tai * 0.5)} 280C${nb(c + g.poi * 0.7)} 400 ${nb(c + g.tai * 0.35)} 520 ${nb(c + g.han * 0.6)} 660L${nb(c + g.han * 0.9)} ${HT}L${LG} ${HT}L${LG} 280Z`
  return `<g${t.decoupe(chemin(silhouette, '#000'))}>${chemin(d, '#160c28', op(force))}</g>`
}

interface Habit { derriere: string; devant: string }

/** Panneaux d'un vêtement ouvert (manteau, veste) : renvoie [tracé gauche, tracé droit]. */
function pans(g: Morpho, yBas: number, lBas: number, ecartHaut: number, ecartBas: number): string[] {
  const c = CX
  return [-1, 1].map((s) =>
    `M${nb(c + s * (g.cou + 8))} 286Q${nb(c + s * g.ep * 0.62)} 290 ${nb(c + s * (g.ep - 4))} 314L${nb(c + s * (g.ep - 24))} 372`
    + `C${nb(c + s * (g.poi + 5))} 392 ${nb(c + s * (g.poi + 2))} 430 ${nb(c + s * (g.poi - 2))} 452C${nb(c + s * (g.tai + 8))} 482 ${nb(c + s * (g.tai + 4))} 500 ${nb(c + s * (g.tai + 4))} 518`
    + `C${nb(c + s * (g.tai + 4))} 562 ${nb(c + s * (g.han + 4))} 590 ${nb(c + s * (g.han + 5))} 640L${nb(c + s * lBas)} ${nb(yBas)}L${nb(c + s * ecartBas)} ${nb(yBas)}`
    + `Q${nb(c + s * (ecartBas - 4))} 560 ${nb(c + s * ecartHaut)} 430L${nb(c + s * (g.cou + 2))} 300Z`,
  )
}

/** Revers d'un vêtement ouvert, du col jusqu'à yFin. */
function revers(g: Morpho, s: number, yFin: number, largeur: number, ecart: number): string {
  const c = CX
  return `M${nb(c + s * (g.cou + 1))} 296L${nb(c + s * (g.cou + 12))} 282L${nb(c + s * (g.cou + largeur))} 338L${nb(c + s * (g.cou + largeur - 14))} 350L${nb(c + s * (ecart + 2))} ${yFin}L${nb(c + s * ecart)} ${yFin - 30}Z`
}

function ceinture(g: Morpho, y: number, h: number, couleur: string, boucle: string, elargi = 0): string {
  const c = CX
  const l = g.tai + 3 + elargi
  return chemin(`M${nb(c - l)} ${y}Q${c} ${y + 7} ${nb(c + l)} ${y}L${nb(c + l + 3)} ${y + h}Q${c} ${y + h + 7} ${nb(c - l - 3)} ${y + h}Z`, couleur)
    + rect(c - 13, y + 2, 26, h + 4, boucle, ' rx="4"') + rect(c - 7, y + 7, 14, h - 6, couleur, ' rx="2"')
}

function tenueUniforme(p: Perso, t: Toile): Habit {
  const { g } = p
  const c = CX
  const veste = p.base
  let o = bas(p, 610, p.seconde)
  const manches = [-1, 1].map((s) => manche(g, s))
  o += manches.map((d) => chemin(d, fonce(veste, 0.1))).join('') + main(p, -1) + main(p, 1)
  for (const s of [-1, 1]) {
    const x = CX + s * g.ep
    o += trait(ligne(x + s * 1, 684, x - s * (g.bras * 0.8), 684), p.accent, 5) + trait(ligne(x + s * 1, 696, x - s * (g.bras * 0.8), 696), p.accent, 2)
  }
  const corps = torse(g, 672, g.han + 9)
  o += chemin(corps, veste)
  o += ombreLaterale(t, corps, g)
  // Chemise et col.
  o += chemin(pts(c - 30, 286, c + 30, 286, c + 4, 476, c - 4, 476), p.clair)
  o += trait(ligne(c, 330, c, 470), fonce(p.clair, 0.14), 2)
  // Cravate (silhouette masculine) ou ruban noué.
  if (g.m) {
    o += chemin(pts(c - 9, 300, c + 9, 300, c + 6, 318, c - 6, 318), fonce(p.accent, 0.15))
    o += chemin(pts(c - 6, 318, c + 6, 318, c + 12, 440, c, 462, c - 12, 440), p.accent)
  } else {
    o += chemin(`M${c} 312L${c - 34} 296Q${c - 40} 314 ${c - 32} 332ZM${c} 312L${c + 34} 296Q${c + 40} 314 ${c + 32} 332Z`, p.accent)
    o += chemin(pts(c - 5, 318, c - 16, 372, c - 4, 366) + pts(c + 5, 318, c + 16, 372, c + 4, 366), fonce(p.accent, 0.15))
    o += rect(c - 8, 304, 16, 17, vif(p.accent, 0.2), ' rx="5"')
  }
  o += chemin(pts(c - 28, 281, c - 3, 306, c - 30, 322) + pts(c + 28, 281, c + 3, 306, c + 30, 322), vif(p.clair, 0.4))
  // Revers, liseré, boutons, écusson.
  for (const s of [-1, 1]) {
    o += chemin(revers(g, s, 478, 50, 2), vif(veste, 0.1))
    o += trait(`M${nb(c + s * (g.cou + 50))} 338L${nb(c + s * (g.cou + 36))} 350L${nb(c + s * 4)} 478`, p.accent, 3)
  }
  o += trait(ligne(c, 478, c - 2, 672), fonce(veste, 0.35), 2.5)
  o += boutons([c + 1], 506, 560, 2, p.metal, 6.5)
  o += trait(ligne(c + g.tai * 0.45, 584, c + g.tai * 0.45 + 40, 580) + ligne(c - g.tai * 0.45, 584, c - g.tai * 0.45 - 40, 580), fonce(veste, 0.35), 2.5)
  const ex = c + g.poi * 0.56
  o += chemin(`M${nb(ex - 13)} 388h26v16q0 14 -13 20q-13 -6 -13 -20Z`, p.accent) + trait(`M${nb(ex - 13)} 388h26v16q0 14 -13 20q-13 -6 -13 -20Z`, p.metal, 2)
  return { derriere: '', devant: o }
}

function tenueRobe(p: Perso, t: Toile): Habit {
  const { g } = p
  const c = CX
  const robe = p.base
  let o = ''
  const manches = [-1, 1].map((s) => manche(g, s, 0, 716, 10))
  o += manches.map((d) => chemin(d, fonce(robe, 0.08))).join('') + main(p, -1) + main(p, 1)
  for (const s of [-1, 1]) {
    const x = CX + s * g.ep
    o += chemin(pts(x + s * 3, 676, x - s * (g.bras * 0.8 + 5), 676, x - s * (g.bras * 0.8 + 3), 718, x + s * 1, 718), p.clair)
    o += trait(ligne(x + s * 3, 676, x - s * (g.bras * 0.8 + 5), 676), p.accent, 3)
  }
  const corps = torse(g, HT, g.han + 76)
  o += chemin(corps, robe)
  // Plis de la jupe.
  let plis = ''
  for (const k of [-0.78, -0.42, -0.08, 0.3, 0.66]) plis += `M${nb(c + k * g.tai)} 560Q${nb(c + k * g.han * 1.25)} 720 ${nb(c + k * (g.han + 76))} ${HT}`
  o += trait(plis, fonce(robe, 0.3), 3.5, op(0.7))
  o += chemin(`M${nb(c - g.tai * 0.2)} 560Q${nb(c - g.han * 0.42)} 720 ${nb(c - (g.han + 76) * 0.5)} ${HT}L${nb(c - (g.han + 76) * 0.36)} ${HT}Q${nb(c - g.han * 0.26)} 720 ${nb(c - g.tai * 0.2)} 560Z`, vif(robe, 0.14), op(0.6))
  o += ombreLaterale(t, corps, g)
  // Empiècement et col.
  if (p.variante % 2 === 0) {
    o += chemin(`M${nb(c - g.cou - 12)} 286Q${c - 78} 300 ${c - 70} 338Q${c - 40} 352 ${c - 4} 326L${c} 304L${c + 4} 326Q${c + 40} 352 ${c + 70} 338Q${c + 78} 300 ${nb(c + g.cou + 12)} 286Q${c} 306 ${nb(c - g.cou - 12)} 286Z`, p.clair)
    o += trait(`M${c - 70} 338Q${c - 40} 352 ${c - 4} 326M${c + 4} 326Q${c + 40} 352 ${c + 70} 338`, p.accent, 3)
    o += cercle(c, 322, 9, p.accent) + cercle(c - 3, 319, 3, '#ffffff', op(0.6))
  } else {
    o += chemin(`M${nb(c - g.cou - 6)} 262L${nb(c + g.cou + 6)} 262L${nb(c + g.cou + 12)} 292Q${c} 304 ${nb(c - g.cou - 12)} 292Z`, robe)
    o += trait(`M${nb(c - g.cou - 6)} 263L${nb(c + g.cou + 6)} 263`, p.accent, 4)
    o += trait(ligne(c, 300, c, 480), fonce(robe, 0.3), 2.5) + boutons([c], 318, 462, 6, p.metal, 4.5)
    o += trait(`M${nb(c - g.ep * 0.7)} 300Q${c - 40} 352 ${c} 362Q${c + 40} 352 ${nb(c + g.ep * 0.7)} 300`, p.accent, 3, op(0.9))
  }
  // Ceinture nouée.
  const y = 500
  o += chemin(`M${nb(c - g.tai - 2)} ${y}Q${c} ${y + 8} ${nb(c + g.tai + 2)} ${y}L${nb(c + g.tai + 2)} ${y + 34}Q${c} ${y + 42} ${nb(c - g.tai - 2)} ${y + 34}Z`, p.accent)
  o += trait(`M${nb(c - g.tai - 2)} ${y + 2}Q${c} ${y + 10} ${nb(c + g.tai + 2)} ${y + 2}`, vif(p.accent, 0.3), 2.5, op(0.7))
  const nx = c - p.cote * g.tai * 0.5
  o += chemin(`M${nb(nx)} ${y + 20}L${nb(nx - 30)} ${y + 2}Q${nb(nx - 36)} ${y + 24} ${nb(nx - 26)} ${y + 44}ZM${nb(nx)} ${y + 20}L${nb(nx + 30)} ${y + 2}Q${nb(nx + 36)} ${y + 24} ${nb(nx + 26)} ${y + 44}Z`, fonce(p.accent, 0.12))
  o += chemin(pts(nx - 6, y + 24, nx - 24, y + 120, nx - 6, y + 110, nx, y + 30) + pts(nx + 6, y + 24, nx + 20, y + 134, nx + 4, y + 122, nx, y + 30), fonce(p.accent, 0.2))
  o += rect(nx - 9, y + 10, 18, 20, vif(p.accent, 0.18), ' rx="6"')
  return { derriere: '', devant: o }
}

function tenueManteau(p: Perso, t: Toile, court: boolean): Habit {
  const { g } = p
  const c = CX
  const manteau = p.base
  const yBas = court ? 690 : HT
  const lBas = court ? g.han + 16 : g.han + 44
  // Dessous : haut clair, ceinture, bas sombre.
  let o = bas(p, 600, p.seconde)
  const haut = court ? melanger(p.clair, p.accent, 0.12) : p.clair
  o += chemin(torse(g, 640, g.han), haut)
  if (court) {
    // Col roulé.
    o += chemin(`M${nb(c - g.cou - 5)} 252Q${c} 262 ${nb(c + g.cou + 5)} 252L${nb(c + g.cou + 9)} 296Q${c} 308 ${nb(c - g.cou - 9)} 296Z`, haut)
    o += trait(`M${nb(c - g.cou - 5)} 266Q${c} 276 ${nb(c + g.cou + 5)} 266M${nb(c - g.cou - 7)} 281Q${c} 291 ${nb(c + g.cou + 7)} 281`, fonce(haut, 0.16), 2)
    let cotes = ''
    for (let x = -3; x <= 3; x++) cotes += `M${nb(c + x * 13)} 312V600`
    o += trait(cotes, fonce(haut, 0.12), 2, op(0.6))
  } else {
    o += chemin(pts(c - 26, 283, c - 3, 306, c - 30, 320) + pts(c + 26, 283, c + 3, 306, c + 30, 320), vif(p.clair, 0.4))
    o += trait(ligne(c, 312, c, 590), fonce(p.clair, 0.16), 2) + boutons([c], 336, 560, 6, fonce(p.clair, 0.3), 3.5)
    o += chemin(pts(c - 7, 300, c + 7, 300, c + 5, 314, c + 10, 372, c, 388, c - 10, 372, c - 5, 314), p.accent)
  }
  o += ceinture(g, 592, 22, fonce(p.seconde, 0.3), p.metal)
  const manches = [-1, 1].map((s) => manche(g, s, 2))
  o += manches.map((d) => chemin(d, fonce(manteau, 0.1))).join('') + main(p, -1) + main(p, 1)
  for (const s of [-1, 1]) {
    const x = CX + s * g.ep
    o += trait(ligne(x + s * 3, 682, x - s * (g.bras * 0.8 + 2), 682), fonce(manteau, 0.35), 3)
    o += cercle(x - s * (g.bras * 0.2), 698, 4.5, p.metal)
  }
  const [gauche, droit] = pans(g, yBas, lBas, court ? 44 : 38, court ? 62 : 58)
  o += chemin(gauche, manteau) + chemin(droit, manteau)
  o += ombreLaterale(t, gauche + droit, g)
  for (const s of [-1, 1]) {
    o += chemin(revers(g, s, court ? 500 : 470, court ? 46 : 58, court ? 47 : 40), vif(manteau, 0.12))
    // Liseré le long de l'ouverture.
    o += trait(`M${nb(c + s * (court ? 47 : 40))} ${court ? 500 : 470}Q${nb(c + s * (court ? 60 : 55))} 600 ${nb(c + s * (court ? 62 : 58))} ${nb(yBas)}`, p.accent, 3.5)
    if (!court) o += boutons([c + s * 78], 500, 640, 3, p.metal, 6)
    o += trait(ligne(c + s * (g.tai + 2), 600, c + s * (g.tai - 36), 606), fonce(manteau, 0.35), 3)
  }
  // Col montant, derrière la nuque.
  const derriere = court ? '' : chemin(`M${nb(c - g.cou - 22)} 250L${nb(c + g.cou + 22)} 250L${nb(c + g.cou + 30)} 300L${nb(c - g.cou - 30)} 300Z`, fonce(manteau, 0.25))
    + trait(`M${nb(c - g.cou - 22)} 251L${nb(c + g.cou + 22)} 251`, p.accent, 3)
  return { derriere, devant: o }
}

function tenueCape(p: Perso, t: Toile): Habit {
  const { g } = p
  const c = CX
  const cape = p.base
  const tunique = p.seconde
  // Pan arrière de la cape, visible de part et d'autre du corps.
  const derriere = chemin(
    `M${nb(c - g.ep - 6)} 300C${nb(c - g.ep - 40)} 440 ${nb(c - g.ep - 52)} 700 ${nb(c - g.ep - 58)} ${HT}L${nb(c + g.ep + 58)} ${HT}C${nb(c + g.ep + 52)} 700 ${nb(c + g.ep + 40)} 440 ${nb(c + g.ep + 6)} 300Z`,
    fonce(cape, 0.3),
  ) + chemin(`M${nb(c - g.cou - 30)} 262Q${c} 240 ${nb(c + g.cou + 30)} 262L${nb(c + g.cou + 40)} 304L${nb(c - g.cou - 40)} 304Z`, fonce(cape, 0.18))
  let o = bas(p, 600, fonce(tunique, 0.12))
  const manches = [-1, 1].map((s) => manche(g, s))
  o += manches.map((d) => chemin(d, fonce(tunique, 0.1))).join('') + main(p, -1) + main(p, 1)
  for (const s of [-1, 1]) {
    const x = CX + s * g.ep
    o += chemin(pts(x + s * 3, 664, x - s * (g.bras * 0.8 + 4), 664, x - s * (g.bras * 0.8 + 3), 718, x + s * 1, 718), fonce(tunique, 0.35))
    o += trait(ligne(x + s * 3, 664, x - s * (g.bras * 0.8 + 4), 664), p.metal, 3)
  }
  const corps = torse(g, 700, g.han + 14)
  o += chemin(corps, tunique) + ombreLaterale(t, corps, g)
  o += trait(ligne(c, 330, c, 600), fonce(tunique, 0.3), 2.5) + trait(`M${nb(c - g.han - 12)} 696L${nb(c + g.han + 12)} 696`, p.accent, 4)
  o += ceinture(g, 510, 26, fonce(tunique, 0.4), p.metal)
  // Pèlerine sur les épaules.
  for (const s of [-1, 1]) {
    const d = `M${nb(c + s * 4)} 296Q${nb(c + s * g.ep * 0.6)} 280 ${nb(c + s * (g.ep + 8))} 312C${nb(c + s * (g.ep + 22))} 380 ${nb(c + s * (g.ep + 24))} 450 ${nb(c + s * (g.ep + 18))} 512Q${nb(c + s * g.ep * 0.7)} 548 ${nb(c + s * 70)} 520Q${nb(c + s * 40)} 420 ${nb(c + s * 4)} 296Z`
    o += chemin(d, cape)
    if (s === 1) o += ombreLaterale(t, d, g, 0.12)
    o += trait(`M${nb(c + s * (g.ep + 18))} 512Q${nb(c + s * g.ep * 0.7)} 548 ${nb(c + s * 70)} 520Q${nb(c + s * 40)} 420 ${nb(c + s * 4)} 296`, p.accent, 4)
    o += trait(`M${nb(c + s * (g.ep * 0.82))} 330Q${nb(c + s * (g.ep * 0.9))} 430 ${nb(c + s * (g.ep * 0.8))} 512`, fonce(cape, 0.3), 3, op(0.6))
  }
  // Col et fermoir.
  o += chemin(`M${nb(c - g.cou - 12)} 276Q${c} 300 ${nb(c + g.cou + 12)} 276L${nb(c + g.cou + 22)} 300Q${c} 330 ${nb(c - g.cou - 22)} 300Z`, vif(cape, 0.14))
  o += trait(`M${c - 22} 312Q${c} 324 ${c + 22} 312`, p.metal, 3.5)
  o += chemin(pts(c, 298, c + 13, 314, c, 334, c - 13, 314), p.accent) + chemin(pts(c, 298, c + 13, 314, c, 314, c - 6, 306), '#ffffff', op(0.35)) + trait(pts(c, 298, c + 13, 314, c, 334, c - 13, 314), p.metal, 2.5)
  return { derriere, devant: o }
}

function tenueKimono(p: Perso, t: Toile, a: Alea): Habit {
  const { g } = p
  const c = CX
  const robe = p.base
  const obi = luminance(p.seconde) > 0.6 ? p.seconde : melanger(p.seconde, p.clair, 0.08)
  let o = ''
  // Manches amples.
  for (const s of [-1, 1]) {
    const x = CX + s * g.ep
    const d = `M${nb(x - s * 36)} 294Q${nb(x + s * 6)} 292 ${nb(x + s * 14)} 340C${nb(x + s * 24)} 470 ${nb(x + s * 36)} 620 ${nb(x + s * 40)} 742Q${nb(x - s * 10)} 770 ${nb(x - s * (g.bras + 22))} 748L${nb(x - s * (g.bras - 2))} 525L${nb(x - s * (g.bras - 6))} 372Z`
    o += chemin(d, fonce(robe, 0.08))
    o += chemin(`M${nb(x + s * 40)} 742Q${nb(x - s * 10)} 770 ${nb(x - s * (g.bras + 22))} 748L${nb(x - s * (g.bras + 16))} 716Q${nb(x - s * 8)} 738 ${nb(x + s * 38)} 712Z`, p.accent)
    o += trait(`M${nb(x + s * 16)} 400Q${nb(x + s * 10)} 560 ${nb(x - s * 2)} 720`, fonce(robe, 0.32), 3, op(0.6))
    o += main(p, s, 728)
  }
  const corps = torse({ ...g, tai: g.tai + 8, poi: g.poi + 2 }, HT, g.han + 16)
  o += chemin(corps, robe)
  // Motifs discrets sur le bas de la robe.
  let motifs = ''
  for (let i = 0; i < 7; i++) {
    const x = c + a.entre(-g.han, g.han)
    const y = a.entre(640, 880)
    const r = a.entre(7, 13)
    for (let k = 0; k < 5; k++) motifs += disque(x + Math.cos((k * 6.283) / 5) * r, y + Math.sin((k * 6.283) / 5) * r, r * 0.62)
  }
  o += `<g${t.decoupe(chemin(corps, '#000'))}>${chemin(motifs, vif(robe, 0.3), op(0.5))}</g>`
  o += ombreLaterale(t, corps, g)
  o += trait(`M${nb(c + g.tai * 0.2)} 590Q${nb(c + g.tai * 0.5)} 740 ${nb(c + g.han * 0.6)} ${HT}`, fonce(robe, 0.32), 3)
  // Cols croisés : sous-col clair, puis bandes de couleur.
  o += chemin(pts(c - 34, 282, c + 34, 282, c + 6, 404, c - 16, 372), p.clair)
  o += chemin(pts(c - 44, 280, c - 22, 284, c + 24, 420, c + 2, 440), vif(robe, 0.08))
  o += chemin(pts(c - 44, 280, c - 36, 281, c + 12, 430, c + 2, 440), p.accent)
  o += chemin(pts(c + 44, 280, c + 22, 284, c - 50, 492, c - 70, 480), vif(robe, 0.12))
  o += chemin(pts(c + 30, 282, c + 22, 284, c - 50, 492, c - 58, 487), p.accent)
  // Large ceinture.
  const y0 = g.m ? 510 : 472
  const y1 = 566
  const l = g.tai + 11
  o += chemin(`M${nb(c - l)} ${y0}Q${c} ${y0 + 8} ${nb(c + l)} ${y0}L${nb(c + l + 3)} ${y1}Q${c} ${y1 + 9} ${nb(c - l - 3)} ${y1}Z`, obi)
  o += trait(`M${nb(c - l)} ${y0 + 2}Q${c} ${y0 + 10} ${nb(c + l)} ${y0 + 2}`, vif(obi, 0.25), 2.5, op(0.7))
  const ym = (y0 + y1) / 2 + 4
  o += trait(`M${nb(c - l - 1)} ${nb(ym)}Q${c} ${nb(ym + 8)} ${nb(c + l + 1)} ${nb(ym)}`, p.accent, 7)
  o += cercle(c, ym + 4, 9, p.metal) + cercle(c, ym + 4, 4.5, p.accent)
  return { derriere: '', devant: o }
}

function tenueGilet(p: Perso, t: Toile): Habit {
  const { g } = p
  const c = CX
  const gilet = p.base
  let o = bas(p, 600, p.seconde)
  // Chemise à manches bouffantes.
  const manches = [-1, 1].map((s) => manche(g, s, 2, 716, 16))
  o += manches.map((d) => chemin(d, fonce(p.clair, 0.06))).join('') + main(p, -1) + main(p, 1)
  for (const s of [-1, 1]) {
    const x = CX + s * g.ep
    o += chemin(pts(x + s * 3, 660, x - s * (g.bras * 0.8 + 5), 660, x - s * (g.bras * 0.8 + 3), 718, x + s * 1, 718), fonce(gilet, 0.2))
    o += boutons([x - s * (g.bras * 0.4)], 678, 702, 2, p.metal, 3.5)
    o += trait(`M${nb(x + s * 14)} 380Q${nb(x + s * 6)} 470 ${nb(x - s * 2)} 560`, fonce(p.clair, 0.22), 2.5, op(0.7))
  }
  const corps = torse(g, 640, g.han)
  o += chemin(corps, p.clair)
  // Gilet ajusté, à pointes.
  const d = `M${nb(c - g.cou - 22)} 288L${nb(c - g.ep + 30)} 330L${nb(c - g.ep + 26)} 376C${nb(c - g.poi - 1)} 392 ${nb(c - g.poi - 2)} 430 ${nb(c - g.poi + 2)} 452C${nb(c - g.tai - 4)} 482 ${nb(c - g.tai - 2)} 500 ${nb(c - g.tai - 2)} 518C${nb(c - g.tai - 2)} 556 ${nb(c - g.han + 6)} 580 ${nb(c - g.han + 2)} 618L${c - 30} 660L${c} 630L${c + 30} 660L${nb(c + g.han - 2)} 618`
    + `C${nb(c + g.han - 6)} 580 ${nb(c + g.tai + 2)} 556 ${nb(c + g.tai + 2)} 518C${nb(c + g.tai + 2)} 500 ${nb(c + g.tai + 4)} 482 ${nb(c + g.poi - 2)} 452C${nb(c + g.poi + 2)} 430 ${nb(c + g.poi + 1)} 392 ${nb(c + g.ep - 26)} 376L${nb(c + g.ep - 30)} 330L${nb(c + g.cou + 22)} 288L${c} 440Z`
  o += chemin(d, gilet) + ombreLaterale(t, d, g)
  o += trait(`M${nb(c - g.cou - 22)} 288L${c} 440L${nb(c + g.cou + 22)} 288`, p.accent, 3.5)
  o += trait(ligne(c, 440, c, 630), fonce(gilet, 0.35), 2.5)
  o += boutons([c - 20, c + 20], 468, 590, 4, p.metal, 5.5)
  // Chaîne de montre.
  o += trait(`M${c + 20} 550Q${nb(c + g.tai * 0.6)} 590 ${nb(c + g.tai * 0.86)} 552`, p.metal, 2.5)
  o += trait(ligne(c + g.tai * 0.5, 540, c + g.tai * 0.98, 536), fonce(gilet, 0.35), 3)
  // Col et lavallière.
  o += chemin(pts(c - 27, 279, c - 3, 304, c - 32, 318) + pts(c + 27, 279, c + 3, 304, c + 32, 318), vif(p.clair, 0.4))
  o += chemin(`M${c} 308L${c - 30} 296Q${c - 34} 318 ${c - 24} 334ZM${c} 308L${c + 30} 296Q${c + 34} 318 ${c + 24} 334Z`, p.accent)
  o += chemin(pts(c - 9, 312, c + 9, 312, c + 16, 380, c, 404, c - 16, 380), fonce(p.accent, 0.12))
  o += cercle(c, 312, 8, p.metal) + cercle(c, 312, 3.5, fonce(p.metal, 0.4))
  o += ceinture(g, 606, 24, fonce(p.seconde, 0.35), p.metal, g.han - g.tai - 6)
  return { derriere: '', devant: o }
}

function dessinerTenue(p: Perso, t: Toile, a: Alea): Habit {
  switch (p.tenue) {
    case 'robe': return tenueRobe(p, t)
    case 'manteau': return tenueManteau(p, t, false)
    case 'veste': return tenueManteau(p, t, true)
    case 'cape': return tenueCape(p, t)
    case 'kimono': return tenueKimono(p, t, a)
    case 'gilet': return tenueGilet(p, t)
    default: return tenueUniforme(p, t)
  }
}

// ───────────────────────── Tête et cheveux ─────────────────────────

interface Crane { tx: number; jx: number; jy: number; mx: number; my: number }

function crane(p: Perso): Crane {
  const k: Crane = p.g.m ? { tx: 61, jx: 39, jy: 226, mx: 21, my: 245 } : { tx: 59, jx: 31, jy: 224, mx: 13, my: 241 }
  if (p.visage === 'fin') { k.jx -= 4; k.mx -= 3; k.my += 2 }
  else if (p.visage === 'carre') { k.jx += 5; k.mx += 5 }
  else if (p.visage === 'rond') { k.jx += 3; k.jy -= 3; k.my -= 3 }
  return k
}

function contourVisage(k: Crane): string {
  const c = CX
  return `M${c - k.tx} 150C${c - k.tx - 2} 104 ${c - 42} 68 ${c} 68C${c + 42} 68 ${c + k.tx + 2} 104 ${c + k.tx} 150`
    + `C${c + k.tx - 1} 187 ${c + k.jx + 13} 210 ${c + k.jx} ${k.jy}Q${c + k.mx} ${k.my} ${c} ${k.my}Q${c - k.mx} ${k.my} ${c - k.jx} ${k.jy}C${c - k.jx - 13} 210 ${c - k.tx + 1} 187 ${c - k.tx} 150Z`
}

/** Mèche effilée, de la racine (x0, y0) à la pointe (x1, y1). */
function meche(x0: number, y0: number, x1: number, y1: number, largeur: number, courbure: number): string {
  const dx = x1 - x0
  const dy = y1 - y0
  const long = Math.hypot(dx, dy) || 1
  const nx = -dy / long
  const ny = dx / long
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  const l = largeur / 2
  return `M${nb(x0 - nx * l)} ${nb(y0 - ny * l)}Q${nb(mx + nx * (courbure - l * 1.1))} ${nb(my + ny * (courbure - l * 1.1))} ${nb(x1)} ${nb(y1)}`
    + `Q${nb(mx + nx * (courbure + l * 1.1))} ${nb(my + ny * (courbure + l * 1.1))} ${nb(x0 + nx * l)} ${nb(y0 + ny * l)}Z`
}

interface Chevelure { derriere: string; devant: string; dessus: string }

function dessinerCheveux(p: Perso, k: Crane, a: Alea): Chevelure {
  const c = CX
  const base = p.cheveux
  const sombre = assombrir(ajuster(base, 0, 4, 0), 0.3)
  const reflet = eclaircir(base, luminance(base) > 0.6 ? 0.45 : 0.28)
  const s = p.cote
  let derriere = ''
  let devant = ''
  let dessus = ''
  const long = p.coiffure === 'longs' || p.coiffure === 'ondules'

  // ── Masse arrière ──
  switch (p.coiffure) {
    case 'longs':
      derriere += chemin(`M${c - 70} 120C${c - 86} 220 ${c - 98} 360 ${c - 104} 500L${c - 92} 590L${c - 70} 548L${c - 44} 604L${c - 14} 556L${c + 14} 604L${c + 42} 552L${c + 70} 596L${c + 96} 540L${c + 104} 500C${c + 98} 360 ${c + 86} 220 ${c + 70} 120Z`, sombre)
      break
    case 'ondules':
      derriere += chemin(`M${c - 70} 110C${c - 104} 170 ${c - 82} 220 ${c - 108} 280C${c - 130} 340 ${c - 96} 390 ${c - 118} 450C${c - 132} 510 ${c - 96} 540 ${c - 84} 566L${c + 84} 566C${c + 96} 540 ${c + 132} 510 ${c + 118} 450C${c + 96} 390 ${c + 130} 340 ${c + 108} 280C${c + 82} 220 ${c + 104} 170 ${c + 70} 110Z`, sombre)
      break
    case 'carre':
      derriere += chemin(`M${c - 72} 120C${c - 82} 180 ${c - 84} 230 ${c - 80} 268Q${c - 40} 282 ${c} 276Q${c + 40} 282 ${c + 80} 268C${c + 84} 230 ${c + 82} 180 ${c + 72} 120Z`, sombre)
      break
    case 'milongs':
      derriere += chemin(`M${c - 72} 120C${c - 84} 190 ${c - 90} 250 ${c - 84} 300Q${c - 96} 322 ${c - 108} 318Q${c - 84} 344 ${c - 52} 320L${c + 52} 320Q${c + 84} 344 ${c + 108} 318Q${c + 96} 322 ${c + 84} 300C${c + 90} 250 ${c + 84} 190 ${c + 72} 120Z`, sombre)
      break
    case 'queue': {
      derriere += chemin(`M${c - 66} 130C${c - 70} 190 ${c - 60} 230 ${c - 40} 252L${c + 40} 252C${c + 60} 230 ${c + 70} 190 ${c + 66} 130Z`, sombre)
      // Queue haute, retombant derrière une épaule.
      const q = `M${c + s * 14} 62C${c + s * 80} 30 ${c + s * 138} 100 ${c + s * 122} 200C${c + s * 108} 290 ${c + s * 136} 370 ${c + s * 100} 452C${c + s * 112} 370 ${c + s * 70} 300 ${c + s * 76} 200C${c + s * 80} 130 ${c + s * 56} 104 ${c + s * 14} 100Z`
      derriere += chemin(q, base) + trait(`M${c + s * 60} 70C${c + s * 110} 90 ${c + s * 106} 160 ${c + s * 100} 220C${c + s * 94} 300 ${c + s * 118} 360 ${c + s * 104} 430`, sombre, 3, op(0.5))
      derriere += chemin(`M${c + s * 34} 58L${c + s * 62} 40Q${c + s * 70} 64 ${c + s * 58} 82ZM${c + s * 34} 58L${c + s * 22} 30Q${c + s * 48} 30 ${c + s * 52} 50Z`, p.accent) + cercle(c + s * 38, 62, 9, vif(p.accent, 0.2))
      break
    }
    case 'tresse':
      derriere += chemin(`M${c - 66} 130C${c - 72} 190 ${c - 62} 236 ${c - 40} 256L${c + 40} 256C${c + 62} 236 ${c + 72} 190 ${c + 66} 130Z`, sombre)
      break
    case 'chignon': {
      derriere += chemin(`M${c - 64} 130C${c - 66} 180 ${c - 56} 220 ${c - 38} 240L${c + 38} 240C${c + 56} 220 ${c + 66} 180 ${c + 64} 130Z`, sombre)
      const bx = c + s * 22
      derriere += cercle(bx, 52, 40, base) + trait(`M${bx - 28} 44Q${bx} 22 ${bx + 28} 44M${bx - 30} 62Q${bx} 40 ${bx + 30} 62`, sombre, 3, op(0.55))
      // Épingles.
      derriere += trait(ligne(bx - 46, 22, bx + 40, 70), p.accent, 5) + cercle(bx - 48, 20, 7, p.accent)
      if (p.theme === 'orientale') derriere += trait(ligne(bx + 44, 18, bx - 36, 72), p.metal, 4) + cercle(bx + 46, 16, 6, p.metal)
      break
    }
    default:
      derriere += chemin(`M${c - 64} 130C${c - 66} 176 ${c - 58} 206 ${c - 44} 224L${c + 44} 224C${c + 58} 206 ${c + 66} 176 ${c + 64} 130Z`, sombre)
  }

  // ── Calotte ──
  const calotte = `M${c - 67} 172C${c - 78} 96 ${c - 46} 51 ${c} 51C${c + 46} 51 ${c + 78} 96 ${c + 67} 172L${c + 57} 168C${c + 61} 140 ${c + 52} 116 ${c + 34} 107Q${c} 96 ${c - 34} 107C${c - 52} 116 ${c - 61} 140 ${c - 57} 168Z`
  devant += chemin(calotte, base)

  // ── Frange ──
  let frange = ''
  if (p.frange === 'droite') {
    for (let i = 0; i < 7; i++) {
      const u = i / 6 - 0.5
      const x0 = c + u * 96
      const x1 = c + u * 112 + a.entre(-4, 4)
      frange += meche(x0, 84 + Math.abs(u) * 16, x1, 141 + a.entre(-3, 6) - Math.abs(u) * 4, 34, u * 6)
    }
  } else if (p.frange === 'cote') {
    const px = c - s * 24
    frange += meche(px, 76, c + s * 60, 152, 46, -s * 16)
    frange += meche(px + s * 4, 78, c + s * 42, 146, 40, -s * 13)
    frange += meche(px + s * 2, 80, c + s * 20, 138, 34, -s * 9)
    frange += meche(px, 82, c - s * 2, 128, 26, -s * 4)
    frange += meche(px - s * 6, 78, c - s * 60, 150, 36, s * 12)
    frange += meche(px - s * 4, 82, c - s * 46, 132, 26, s * 8)
  } else if (p.frange === 'milieu') {
    for (const q of [-1, 1]) {
      frange += meche(c + q * 2, 74, c + q * 62, 156, 44, -q * 15)
      frange += meche(c + q * 4, 78, c + q * 50, 138, 36, -q * 11)
      frange += meche(c + q * 4, 82, c + q * 34, 122, 26, -q * 6)
    }
  } else {
    // Front dégagé : une mèche rebelle.
    frange += meche(c - s * 10, 92, c + s * 30, 122, 16, -s * 7)
  }
  devant += chemin(frange, p.ombrePeau, ` transform="translate(0 5)"${op(0.45)}`) + chemin(frange, base)

  // ── Mèches latérales ──
  const yLat = p.coiffure === 'courts' ? (p.g.m ? 178 : 196) : p.coiffure === 'chignon' || p.coiffure === 'queue' || p.coiffure === 'tresse' ? 214 : p.coiffure === 'carre' ? 262 : p.coiffure === 'milongs' ? 300 : 0
  if (yLat) {
    for (const q of [-1, 1]) devant += chemin(meche(c + q * 61, 120, c + q * (p.coiffure === 'carre' ? 60 : 55), yLat, p.g.m ? 14 : 22, q * (p.coiffure === 'carre' || p.coiffure === 'milongs' ? -7 : 3)), base)
  }
  if (long) {
    // Longues mèches retombant sur les épaules et la poitrine.
    for (const q of [-1, 1]) {
      const fin = p.coiffure === 'ondules' ? 440 : 470
      if (p.coiffure === 'ondules') {
        dessus += chemin(`M${c + q * 50} 118C${c + q * 82} 170 ${c + q * 60} 230 ${c + q * 78} 290C${c + q * 96} 350 ${c + q * 66} 392 ${c + q * 80} ${fin}C${c + q * 50} 400 ${c + q * 70} 350 ${c + q * 54} 300C${c + q * 40} 250 ${c + q * 58} 200 ${c + q * 50} 118Z`, base)
        dessus += trait(`M${c + q * 62} 170C${c + q * 70} 220 ${c + q * 58} 250 ${c + q * 68} 300C${c + q * 78} 350 ${c + q * 66} 380 ${c + q * 72} 420`, sombre, 2.5, op(0.45))
      } else {
        dessus += chemin(`M${c + q * 52} 118C${c + q * 72} 200 ${c + q * 70} 300 ${c + q * 76} 380Q${c + q * 78} 440 ${c + q * 64} ${fin}Q${c + q * 62} 420 ${c + q * 52} 380C${c + q * 46} 300 ${c + q * 60} 220 ${c + q * 52} 118Z`, base)
        dessus += trait(`M${c + q * 60} 180C${c + q * 68} 260 ${c + q * 62} 340 ${c + q * 68} 430`, sombre, 2.5, op(0.45))
      }
    }
  }
  if (p.coiffure === 'tresse') {
    // Tresse ramenée sur l'épaule.
    let d = ''
    const n = 8
    for (let i = 0; i < n; i++) {
      const y = 214 + i * 33
      const x = c + s * (60 + i * 3) + (i % 2 ? 6 : -6) * s
      const r = 19 - i * 0.9
      d += `M${nb(x - r)} ${nb(y)}Q${nb(x - r * 0.3)} ${nb(y + r * 1.5)} ${nb(x + r * 0.4)} ${nb(y + r * 1.9)}Q${nb(x + r * 1.1)} ${nb(y + r * 0.6)} ${nb(x + r * 0.5)} ${nb(y - r * 0.5)}Q${nb(x - r * 0.4)} ${nb(y - r * 0.6)} ${nb(x - r)} ${nb(y)}Z`
    }
    const yf = 214 + n * 33
    const xf = c + s * (60 + n * 3)
    dessus += chemin(d, base) + trait(d, sombre, 2, op(0.5))
    dessus += chemin(meche(xf, yf - 4, xf + s * 4, yf + 58, 26, 0), base)
    dessus += rect(xf - 13, yf - 10, 26, 13, p.accent, ' rx="5"')
  }

  // ── Reflets ──
  devant += trait(`M${c - 46} 100Q${c} 70 ${c + 46} 100`, reflet, 7, ` stroke-dasharray="${nb(a.entre(16, 30))} 7 ${nb(a.entre(34, 54))} 9 ${nb(a.entre(10, 24))} 200"${op(0.5)}`)
  devant += trait(`M${c - s * 24} 60Q${c - s * 50} 80 ${c - s * 62} 130M${c - s * 14} 58Q${c + s * 30} 66 ${c + s * 58} 116`, sombre, 2.5, op(0.3))

  // ── Ornements de coiffure, à la couleur du personnage ──
  if (!p.g.m && (p.coiffure === 'longs' || p.coiffure === 'ondules' || p.coiffure === 'carre' || p.coiffure === 'milongs' || p.coiffure === 'courts')) {
    if (p.ornement === 0) {
      // Serre-tête.
      devant += trait(`M${c - 67} 126Q${c - 60} 62 ${c} 60Q${c + 60} 62 ${c + 67} 126`, p.accent, 8) + trait(`M${c - 58} 90Q${c - 40} 62 ${c} 60`, vif(p.accent, 0.35), 2.5, op(0.7))
    } else if (p.ornement === 1) {
      // Barrette en fleur.
      const fx = c - s * 56
      let fleur = ''
      for (let i = 0; i < 5; i++) fleur += disque(fx + Math.cos((i * 6.283) / 5 - 1.57) * 11, 112 + Math.sin((i * 6.283) / 5 - 1.57) * 11, 8.5)
      devant += chemin(fleur, p.accent) + cercle(fx, 112, 6, p.metal)
    } else if (p.ornement === 2) {
      // Ruban noué.
      const fx = c + s * 54
      devant += chemin(`M${fx} 96L${fx - 24} 80Q${fx - 30} 100 ${fx - 22} 116ZM${fx} 96L${fx + 24} 80Q${fx + 30} 100 ${fx + 22} 116Z`, p.accent) + cercle(fx, 97, 7, vif(p.accent, 0.2))
    }
  }
  return { derriere, devant, dessus }
}

// ───────────────────────── Visage et expressions ─────────────────────────

interface Mimique {
  /** Ouverture de l'œil (1 = repos). */
  ouv: number
  /** Hauteur de paupière côté nez et côté tempe. */
  dedans: number
  dehors: number
  /** Paupière inférieure : < 1 remontée (sourire), > 1 abaissée. */
  dessous: number
  /** Chute du coin externe. */
  chute: number
  iris: number
  rx: number
  ry: number
  /** Sourcils : décalage général, côté nez, côté tempe, cambrure. */
  sy: number
  sNez: number
  sTempe: number
  sArc: number
  bouche: Expression
  rougeur: number
}

const MIMIQUES: Record<Expression, Mimique> = {
  neutre: { ouv: 1, dedans: 1, dehors: 1, dessous: 1, chute: 0, iris: 1, rx: 0, ry: 0, sy: 0, sNez: 1, sTempe: 1, sArc: 5, bouche: 'neutre', rougeur: 0.1 },
  sourire: { ouv: 0.92, dedans: 1, dehors: 1, dessous: 0.35, chute: -1, iris: 1.04, rx: 0, ry: -0.5, sy: -4, sNez: 0, sTempe: 0, sArc: 8, bouche: 'sourire', rougeur: 0.22 },
  colere: { ouv: 0.86, dedans: 0.3, dehors: 1.12, dessous: 0.8, chute: -2, iris: 0.94, rx: 0, ry: 0, sy: 6, sNez: 11, sTempe: -8, sArc: -1, bouche: 'colere', rougeur: 0.06 },
  gene: { ouv: 0.9, dedans: 1, dehors: 0.9, dessous: 0.8, chute: 1, iris: 1, rx: 4.5, ry: 2, sy: -2, sNez: -6, sTempe: 3, sArc: 3, bouche: 'gene', rougeur: 0.62 },
  tristesse: { ouv: 0.74, dedans: 1.1, dehors: 0.6, dessous: 1, chute: 4, iris: 1, rx: 0, ry: 3, sy: 0, sNez: -10, sTempe: 5, sArc: 2, bouche: 'tristesse', rougeur: 0.04 },
  surprise: { ouv: 1.32, dedans: 1, dehors: 1, dessous: 1.35, chute: 0, iris: 0.78, rx: 0, ry: 0, sy: -13, sNez: -2, sTempe: 0, sArc: 10, bouche: 'surprise', rougeur: 0.1 },
}

function dessinerVisage(p: Perso, expression: Expression, t: Toile): string {
  const c = CX
  const m = MIMIQUES[expression] ?? MIMIQUES.neutre
  const masc = p.g.m
  const yOeil = 164
  const ecart = 27.5
  const l = masc ? 31 : 35
  const hHaut = (masc ? 9.5 : 12.5) * 1.33
  const hBas = masc ? 4.5 : 6
  const cil = melanger(assombrir(p.cheveux, 0.7), '#1c1418', 0.6)
  const sourcil = luminance(p.cheveux) > 0.55 ? assombrir(p.cheveux, 0.38) : melanger(p.cheveux, '#1c1418', 0.35)
  const levre = melanger(p.ombrePeau, masc ? '#8a4a44' : '#c2455c', masc ? 0.35 : 0.55)
  let o = ''

  // Joues.
  if (m.rougeur > 0) {
    const rose = melanger('#ff6f7f', p.peau, luminance(p.peau) < 0.45 ? 0.35 : 0)
    for (const s of [-1, 1]) o += ellipse(c + s * 37, 192, 19, 10, t.halo(rose), op(Math.min(1, m.rougeur * 1.5)))
    if (expression === 'gene') {
      let h = ''
      for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) h += ligne(c + s * 37 + i * 8 + 3, 187, c + s * 37 + i * 8 - 3, 197)
      o += trait(h, '#e8455e', 2, op(0.6))
    }
  }

  // Yeux.
  for (const s of [-1, 1]) {
    const ex = c + s * ecart
    const xi = ex - s * l / 2
    const xo = ex + s * l / 2
    const yi = yOeil + 2
    const yo = yOeil - 1 + m.chute
    const haut = `C${nb(xi + s * l * 0.2)} ${nb(yi - hHaut * m.ouv * m.dedans)} ${nb(xi + s * l * 0.72)} ${nb(yOeil - hHaut * m.ouv * m.dehors)} ${nb(xo)} ${nb(yo)}`
    const basY = yOeil + hBas * 1.33 * m.dessous * Math.min(1.15, m.ouv)
    const forme = `M${nb(xi)} ${nb(yi)}${haut}C${nb(xo - s * l * 0.25)} ${nb(basY)} ${nb(xi + s * l * 0.3)} ${nb(basY)} ${nb(xi)} ${nb(yi)}Z`
    const r = (masc ? 8.6 : 10.6) * m.iris
    const ix = ex + m.rx
    const iy = yOeil - 2 + m.ry
    o += chemin(forme, '#fdfaf7')
    o += `<g${t.decoupe(chemin(forme, '#000'))}>`
      + cercle(ix, iy, r, t.lineaire(0, iy - r, 0, iy + r, [[0, assombrir(p.yeux, 0.5)], [0.55, p.yeux], [1, eclaircir(p.yeux, 0.35)]]))
      + cercle(ix, iy, r * 0.46, assombrir(p.yeux, 0.78))
      + rect(ex - l, yOeil - 22, 2 * l, 22 - hHaut * m.ouv * 0.36, '#2a1c3a', op(0.2))
      + '</g>'
    o += cercle(ix - r * 0.38, iy - r * 0.42, r * 0.3, '#ffffff') + cercle(ix + r * 0.34, iy + r * 0.38, r * 0.15, '#ffffff', op(0.75))
    // Cils et paupières.
    const aile = masc ? '' : `l${nb(s * 6)} ${nb(-4.5)}`
    o += trait(`M${nb(xi)} ${nb(yi)}${haut}${aile}`, cil, masc ? 2.8 : 3.8)
    o += trait(`M${nb(xo - s * 2)} ${nb(yo + 2)}Q${nb(xo - s * l * 0.3)} ${nb(basY - 0.5)} ${nb(ex)} ${nb(basY - 1.2)}`, cil, 1.5, op(0.5))
    if (m.ouv < 1.2) o += trait(`M${nb(xi + s * 5)} ${nb(yi - hHaut * m.ouv * 0.75 - 6)}Q${nb(ex + s * 2)} ${nb(yOeil - hHaut * m.ouv * 0.76 - 8.5)} ${nb(xo - s * 2)} ${nb(yo - 7)}`, p.ombrePeau, 1.8, op(0.7))
    if (expression === 'sourire') o += trait(`M${nb(xi + s * 7)} ${nb(basY + 4.5)}Q${nb(ex)} ${nb(basY + 7)} ${nb(xo - s * 6)} ${nb(basY + 3.5)}`, p.ombrePeau, 1.8, op(0.7))

    // Sourcils.
    const ys = yOeil - (masc ? 22 : 25) + m.sy
    const x1 = ex - s * (l / 2 - 1)
    const x2 = ex + s * (l / 2 + 5)
    const y1 = ys + m.sNez
    const y2 = ys + m.sTempe + 1
    o += trait(`M${nb(x1)} ${nb(y1)}Q${nb((x1 + x2) / 2 + s * 3)} ${nb((y1 + y2) / 2 - m.sArc)} ${nb(x2)} ${nb(y2)}`, sourcil, masc ? 5.6 : 3.6)
  }
  if (expression === 'colere') o += trait(ligne(c - 4, 146, c - 2, 154) + ligne(c + 4, 146, c + 2, 154), p.ombrePeau, 2)
  if (expression === 'tristesse') {
    // Larme au coin de l'œil.
    const lx = c + p.cote * (ecart + l / 2 - 3)
    o += chemin(`M${nb(lx)} 172Q${nb(lx - 5)} 182 ${nb(lx)} 186Q${nb(lx + 5)} 182 ${nb(lx)} 172Z`, '#cfe9ff', op(0.9)) + cercle(lx - 1, 181, 1.4, '#ffffff')
  }
  if (expression === 'surprise') o += trait(ligne(c + p.cote * 76, 112, c + p.cote * 82, 100) + ligne(c + p.cote * 86, 122, c + p.cote * 96, 114), levre, 2.5, op(0.6))
  if (expression === 'gene') {
    // Goutte de sueur sur la tempe.
    const gx = c - p.cote * 50
    o += chemin(`M${nb(gx)} 126Q${nb(gx - 6)} 140 ${nb(gx)} 145Q${nb(gx + 6)} 140 ${nb(gx)} 126Z`, '#cfe9ff', op(0.85))
  }

  // Nez.
  o += trait(`M${c + 2} 186Q${c + 7} 197 ${c - 1} 200`, p.ombrePeau, 2.2, op(0.9))

  // Bouche.
  const yb = masc ? 218 : 215
  switch (m.bouche) {
    case 'sourire':
      o += chemin(`M${c - 19} ${yb - 5}Q${c} ${yb + 3} ${c + 19} ${yb - 5}Q${c + 12} ${yb + 14} ${c} ${yb + 14}Q${c - 12} ${yb + 14} ${c - 19} ${yb - 5}Z`, '#7c2434')
      o += chemin(`M${c - 15} ${yb - 3}Q${c} ${yb + 4} ${c + 15} ${yb - 3}Q${c} ${yb + 6.5} ${c - 15} ${yb - 3}Z`, '#ffffff')
      o += chemin(`M${c - 9} ${yb + 11}Q${c} ${yb + 5} ${c + 9} ${yb + 11}Q${c} ${yb + 15} ${c - 9} ${yb + 11}Z`, '#e07a86')
      o += trait(`M${c - 21} ${yb - 7}Q${c - 21} ${yb - 4} ${c - 19} ${yb - 5}M${c + 21} ${yb - 7}Q${c + 21} ${yb - 4} ${c + 19} ${yb - 5}`, levre, 2.2)
      break
    case 'colere':
      o += chemin(`M${c - 15} ${yb + 5}Q${c} ${yb - 7} ${c + 15} ${yb + 5}Q${c} ${yb + 8} ${c - 15} ${yb + 5}Z`, '#6e2030')
      o += chemin(`M${c - 11} ${yb + 2}Q${c} ${yb - 5} ${c + 11} ${yb + 2}Q${c} ${yb + 1} ${c - 11} ${yb + 2}Z`, '#ffffff')
      o += trait(`M${c - 15} ${yb + 5}Q${c} ${yb - 7} ${c + 15} ${yb + 5}`, levre, 2.4)
      break
    case 'gene':
      o += trait(`M${c - 12} ${yb + 1}q4 -5 8 0t8 0t8 0`, levre, 2.6)
      break
    case 'tristesse':
      o += trait(`M${c - 11} ${yb + 4}Q${c} ${yb - 4} ${c + 11} ${yb + 4}`, levre, 2.6)
      o += trait(`M${c - 6} ${yb + 9}Q${c} ${yb + 7} ${c + 6} ${yb + 9}`, p.ombrePeau, 2, op(0.7))
      break
    case 'surprise':
      o += ellipse(c, yb + 2, 7.5, 10, '#6e2030') + ellipse(c, yb + 5, 4.5, 5, '#b8505e', op(0.8))
      break
    default:
      o += trait(`M${c - 12} ${yb - 1}Q${c} ${yb + 3} ${c + 12} ${yb - 1}`, levre, 2.6)
      if (!masc) o += ellipse(c, yb + 5.5, 8, 3, levre, op(0.35))
      else o += trait(`M${c - 5} ${yb + 7}H${c + 5}`, p.ombrePeau, 1.8, op(0.6))
  }
  return o
}

function dessinerTete(p: Perso, k: Crane): string {
  const c = CX
  const { g } = p
  let o = ''
  // Cou et naissance des épaules.
  o += chemin(`M${nb(c - g.cou)} 205L${nb(c - g.cou)} 274Q${nb(c - g.cou - 3)} 290 ${nb(c - g.cou - 40)} 302L${nb(c + g.cou + 40)} 302Q${nb(c + g.cou + 3)} 290 ${nb(c + g.cou)} 274L${nb(c + g.cou)} 205Z`, p.peau)
  o += chemin(`M${nb(c - g.cou)} 215L${nb(c - g.cou)} 240Q${c} 276 ${nb(c + g.cou)} 240L${nb(c + g.cou)} 215Z`, p.ombrePeau, op(0.75))
  // Oreilles.
  for (const s of [-1, 1]) o += ellipse(c + s * (k.tx + 1), 172, 8, 17, p.peau) + ellipse(c + s * (k.tx + 1), 173, 4, 10, p.ombrePeau, op(0.6))
  // Visage.
  const contour = contourVisage(k)
  o += chemin(contour, p.peau)
  o += chemin(`M${c + k.tx} 150C${c + k.tx - 1} 187 ${c + k.jx + 13} 210 ${c + k.jx} ${k.jy}Q${c + k.mx} ${k.my} ${c} ${k.my}Q${c + k.mx + 6} ${k.my - 14} ${c + k.jx - 2} ${k.jy - 26}Q${c + k.tx - 8} 190 ${c + k.tx} 150Z`, p.ombrePeau, op(0.4))
  if (p.grain) o += cercle(c - p.cote * 22, 203, 1.8, assombrir(p.ombrePeau, 0.5))
  if (p.barbe) {
    const barbe = assombrir(p.cheveux, 0.12)
    o += chemin(`M${c - k.tx + 2} 176C${c - k.tx + 2} 206 ${c - k.jx - 8} 224 ${c - k.jx + 2} ${k.jy + 4}Q${c - k.mx} ${k.my + 6} ${c} ${k.my + 6}Q${c + k.mx} ${k.my + 6} ${c + k.jx - 2} ${k.jy + 4}C${c + k.jx + 8} 224 ${c + k.tx - 2} 206 ${c + k.tx - 2} 176Q${c + k.tx - 12} 204 ${c + 22} 208Q${c} 200 ${c - 22} 208Q${c - k.tx + 12} 204 ${c - k.tx + 2} 176Z`, barbe, op(0.92))
    o += chemin(`M${c - 22} 208Q${c} 200 ${c + 22} 208Q${c + 16} 226 ${c} 228Q${c - 16} 226 ${c - 22} 208Z`, p.peau)
  }
  return o
}

function dessinerLunettes(p: Perso): string {
  const c = CX
  const monture = p.theme === 'steampunk' ? p.metal : '#2a2630'
  let o = ''
  for (const s of [-1, 1]) {
    const x = c + s * 28
    if (p.lunettesRondes) o += cercle(x, 165, 21, '#ffffff', op(0.14)) + trait(disque(x, 165, 21), monture, 3)
    else o += rect(x - 23, 149, 46, 31, '#ffffff', ` rx="9"${op(0.14)}`) + trait(`M${x - 23} 158q0 -9 9 -9h28q9 0 9 9v13q0 9 -9 9h-28q-9 0 -9 -9Z`, monture, 3)
    o += trait(ligne(x + s * 22, 162, c + s * 62, 158), monture, 2.5)
    o += trait(ligne(x - 12, 156, x - 4, 150), '#ffffff', 2.5, op(0.6))
  }
  return o + trait(`M${c - 7} 163Q${c} 158 ${c + 7} 163`, monture, 3)
}

function dessinerAccessoires(p: Perso, k: Crane): string {
  const c = CX
  let o = ''
  const oreillesVisibles = p.coiffure === 'chignon' || p.coiffure === 'queue' || p.coiffure === 'tresse' || p.coiffure === 'courts'
  if (p.boucles && oreillesVisibles) {
    for (const s of [-1, 1]) o += trait(ligne(c + s * (k.tx + 2), 188, c + s * (k.tx + 2), 198), p.metal, 2) + chemin(pts(c + s * (k.tx + 2), 197, c + s * (k.tx + 8), 207, c + s * (k.tx + 2), 217, c + s * (k.tx - 4), 207), p.accent)
  }
  if (p.theme === 'steampunk' && p.variante % 5 < 2) {
    // Lunettes de mécanicien relevées sur le front.
    o += trait(`M${c - 66} 110Q${c} 78 ${c + 66} 110`, '#4a3528', 9)
    for (const s of [-1, 1]) o += cercle(c + s * 26, 88, 19, p.metal) + cercle(c + s * 26, 88, 13, '#2c4a52') + trait(`M${c + s * 26 - 8} 84Q${c + s * 26 - 4} 78 ${c + s * 26 + 2} 78`, '#ffffff', 2.5, op(0.6))
    o += rect(c - 9, 82, 18, 10, fonce(p.metal, 0.3), ' rx="3"')
  }
  return o
}

// ───────────────────────── Assemblage ─────────────────────────

export interface PartiesSprite {
  /** Dégradés et découpes. */
  defs: string
  /** Tout le personnage sauf le visage (cheveux, corps, tenue). */
  arriere: string
  /** Yeux, sourcils, bouche, joues : la seule partie qui dépend de l'expression. */
  visage: string
  /** Ce qui passe devant le visage (lunettes). */
  avant: string
}

interface OptionsSprite { graine: number; expression: Expression; couleur: string; apparence?: string; theme: ThemeArt }

/** Détail des couches du sprite ; `arriere` et `avant` ne dépendent pas de l'expression. */
export function decomposerSprite(o: OptionsSprite): PartiesSprite {
  const p = creerPerso(o)
  const identite = `${p.accent}|${o.apparence ?? ''}|${p.theme}`
  const stable = new Toile(prefixeId('s', o.graine, identite))
  const mobile = new Toile(prefixeId('v', o.graine, identite + '|' + o.expression))
  const k = crane(p)
  const habit = dessinerTenue(p, stable, creerAlea(deriver(o.graine, 'tenue')))
  const cheveux = dessinerCheveux(p, k, creerAlea(deriver(o.graine, 'cheveux')))
  const arriere = cheveux.derriere + habit.derriere + dessinerTete(p, k) + habit.devant + cheveux.dessus + cheveux.devant + dessinerAccessoires(p, k)
  const visage = dessinerVisage(p, o.expression, mobile)
  const avant = p.lunettes ? dessinerLunettes(p) : ''
  return { defs: stable.defs.join('') + mobile.defs.join(''), arriere, visage, avant }
}

/** Sprite en buste (jusqu'à mi-cuisse), 600×900, FOND TRANSPARENT. Même (graine, couleur, apparence, theme) ⇒ même personnage ; seule l'expression change. */
export function spriteSvg(o: OptionsSprite): string {
  const s = decomposerSprite(o)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LG} ${HT}" width="${LG}" height="${HT}" role="img">`
    + (s.defs ? `<defs>${s.defs}</defs>` : '')
    + `<g data-partie="corps">${s.arriere}</g>`
    + `<g data-partie="visage">${s.visage}</g>`
    + `<g data-partie="avant">${s.avant}</g>`
    + '</svg>'
}
