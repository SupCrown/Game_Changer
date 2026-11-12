/**
 * Décors procéduraux : illustration vectorielle plate, 1600×900.
 * La composition dépend de (type, graine, thème) ; la lumière ne change que les couleurs,
 * le ciel et les sources lumineuses.
 */
import type { Lumiere, TypeLieu } from '@shared/types'
import {
  type Alea, Lot, Toile, ajuster, assombrir, cercle, chemin, creerAlea, deriver, disque, echapper,
  eclaircir, ellipse, ligne, melanger, multiplier, nb, op, prefixeId, pts, rect, trait,
} from './alea'

export type ThemeArt = 'fantasy' | 'gothique' | 'orientale' | 'steampunk' | 'moderne' | 'libre'

const L = 1600
const H = 900

// ───────────────────────── Palettes ─────────────────────────

type FormeArc = 'ogive' | 'plein' | 'rect' | 'bas' | 'pans'

interface Palette {
  mur: string
  boiserie: string
  sol: string
  bois: string
  pierre: string
  toit: string
  feuillage: string
  tissu: string
  metal: string
  accent: string
  lampe: string
  teinteCiel: string
  forceCiel: number
  arc: FormeArc
}

const PALETTES: Record<ThemeArt, Palette> = {
  fantasy: {
    mur: '#dccbad', boiserie: '#7d5b3d', sol: '#93704e', bois: '#6d4b30', pierre: '#b0a898', toit: '#4c6b94',
    feuillage: '#4c8a55', tissu: '#96303f', metal: '#cfa64e', accent: '#3f83c4', lampe: '#ffd27a',
    teinteCiel: '#8a6fe0', forceCiel: 0.1, arc: 'plein',
  },
  gothique: {
    mur: '#9a95a6', boiserie: '#40364a', sol: '#554c5e', bois: '#3d2e33', pierre: '#827d8c', toit: '#34304a',
    feuillage: '#3f6052', tissu: '#7a2238', metal: '#a3a3b4', accent: '#8b2f52', lampe: '#ffbe7d',
    teinteCiel: '#6a6478', forceCiel: 0.3, arc: 'ogive',
  },
  orientale: {
    mur: '#ece1ca', boiserie: '#93402f', sol: '#aa875e', bois: '#822f26', pierre: '#b9b1a1', toit: '#3d4b52',
    feuillage: '#5c9360', tissu: '#c8483c', metal: '#d6b25c', accent: '#d6604c', lampe: '#ffc98a',
    teinteCiel: '#ff9db0', forceCiel: 0.12, arc: 'pans',
  },
  steampunk: {
    mur: '#bd9870', boiserie: '#5c3d2a', sol: '#73533c', bois: '#513524', pierre: '#93806c', toit: '#5f4236',
    feuillage: '#70803f', tissu: '#80402d', metal: '#bf7a38', accent: '#2f8380', lampe: '#ffc76b',
    teinteCiel: '#d0a35c', forceCiel: 0.26, arc: 'plein',
  },
  moderne: {
    mur: '#e3e5ea', boiserie: '#bcc2cc', sol: '#a2a8b2', bois: '#ac8963', pierre: '#c2c6cc', toit: '#5b6471',
    feuillage: '#5a9c6d', tissu: '#3f6394', metal: '#8f9bab', accent: '#e36a4c', lampe: '#fff1cc',
    teinteCiel: '#ffffff', forceCiel: 0, arc: 'rect',
  },
  libre: {
    mur: '#d8cfbf', boiserie: '#786351', sol: '#8a7560', bois: '#69533f', pierre: '#a8a39b', toit: '#5c6278',
    feuillage: '#56895c', tissu: '#7f4c6f', metal: '#bcaa7c', accent: '#5b83b6', lampe: '#ffd590',
    teinteCiel: '#ffffff', forceCiel: 0, arc: 'bas',
  },
}

interface Eclairage {
  /** Du zénith vers l'horizon. */
  ciel: [string, string, string, string]
  /** Lumière qui tombe sur les surfaces en extérieur. */
  ambiante: string
  /** Lumière qui tombe sur les surfaces en intérieur. */
  interieur: string
  brume: string
  rayon: string
  forceRayon: number
  ombre: string
  forceOmbre: number
  lampes: number
  etoiles: number
  nuage: string
  forceNuage: number
  /** Proportion de fenêtres éclairées vues de l'extérieur. */
  vitres: number
}

const ECLAIRAGES: Record<Lumiere, Eclairage> = {
  jour: {
    ciel: ['#3b7bd0', '#6eaae6', '#a9d4f3', '#e9f3f3'],
    ambiante: '#ffffff', interieur: '#f1e8dc', brume: '#cfe1f0',
    rayon: '#fff6d6', forceRayon: 1, ombre: '#131726', forceOmbre: 0.5,
    lampes: 0, etoiles: 0, nuage: '#ffffff', forceNuage: 0.85, vitres: 0,
  },
  crepuscule: {
    ciel: ['#2a2a66', '#84478a', '#ee7d62', '#ffd18c'],
    ambiante: '#e2a089', interieur: '#d79b80', brume: '#e2917a',
    rayon: '#ffb066', forceRayon: 0.95, ombre: '#1e0f24', forceOmbre: 0.58,
    lampes: 0.75, etoiles: 0.3, nuage: '#ffc7a3', forceNuage: 0.5, vitres: 0.32,
  },
  nuit: {
    ciel: ['#050818', '#0c1434', '#1b2a5c', '#3b4c84'],
    ambiante: '#4a5b96', interieur: '#70669a', brume: '#18224c',
    rayon: '#9db5ff', forceRayon: 0.42, ombre: '#03050f', forceOmbre: 0.66,
    lampes: 1, etoiles: 1, nuage: '#2b3768', forceNuage: 0.6, vitres: 0.58,
  },
}

// ───────────────────────── Scène ─────────────────────────

interface Scene {
  t: Toile
  /** Hasard de composition : ne jamais le consommer sous une condition de lumière. */
  a: Alea
  graine: number
  theme: ThemeArt
  lum: Lumiere
  p: Palette
  e: Eclairage
  interieur: boolean
  /** Côté de l'astre : -1 à gauche, 1 à droite. */
  sens: number
  rayons: string[]
  lueurs: string[]
  /** Couleur locale → couleur éclairée, avec voile atmosphérique selon la profondeur (0 proche, 1 lointain). */
  c(couleur: string, profondeur?: number): string
}

function halo(s: Scene, cx: number, cy: number, r: number, couleur: string, force: number): void {
  if (force <= 0) return
  s.lueurs.push(cercle(cx, cy, r, s.t.halo(couleur), op(force)))
}

// ───────────────────────── Ciel et lointains ─────────────────────────

function ciel(s: Scene, horizon: number): string {
  const ra = creerAlea(deriver(s.graine, 'ciel'))
  const [c0, c1, c2, c3] = s.e.ciel
  let o = rect(0, 0, L, horizon + 60, s.t.lineaire(0, 0, 0, horizon, [[0, c0], [0.42, c1], [0.78, c2], [1, c3]]))

  if (s.e.etoiles > 0) {
    const re = creerAlea(deriver(s.graine, 'etoiles'))
    let petites = ''
    let grandes = ''
    for (let i = 0; i < 120; i++) {
      const ex = re.entre(0, L)
      const ey = re.entre(0, horizon * 0.86)
      const r = re.entre(0.7, 2)
      if (r > 1.55) grandes += disque(ex, ey, r)
      else petites += disque(ex, ey, r)
    }
    o += chemin(petites, '#ffffff', op(0.55 * s.e.etoiles)) + chemin(grandes, '#fff6dc', op(0.95 * s.e.etoiles))
  }

  const u = ra.n()
  const v = ra.n()
  const ax = s.sens < 0 ? 190 + u * 280 : 1130 + u * 280
  if (s.lum === 'jour') {
    const ay = 80 + v * 80
    o += cercle(ax, ay, 330, s.t.halo('#fff8dc'), op(0.85)) + cercle(ax, ay, 40, '#fffdf2')
  } else if (s.lum === 'crepuscule') {
    const ay = horizon - 46 - v * 50
    o += cercle(ax, ay, 520, s.t.halo('#ffd98f'), op(0.9)) + cercle(ax, ay, 56, '#fff2c6')
  } else {
    const ay = 90 + v * 80
    o += cercle(ax, ay, 250, s.t.halo('#aebfff'), op(0.5)) + cercle(ax, ay, 44, '#f4f1e3')
    o += chemin(disque(ax - 14, ay - 10, 9) + disque(ax + 12, ay + 6, 12) + disque(ax - 6, ay + 20, 6), '#b9bdd0', op(0.35))
  }

  // Nuages en bandes superposées, façon affiche.
  const rn = creerAlea(deriver(s.graine, 'nuages'))
  let nuages = ''
  for (let i = 0; i < 6; i++) {
    const cx = rn.entre(-150, L)
    const cy = rn.entre(40, Math.max(100, horizon * 0.62))
    const ech = rn.entre(0.7, 1.5)
    for (let j = 0; j < 3; j++) {
      const l = ech * rn.entre(150, 380)
      const h = ech * 24
      const x = cx + rn.entre(-70, 70) * ech
      nuages += rect(x, cy + j * h * 0.82, l, h, s.e.nuage, ` rx="${nb(h / 2)}"`)
    }
  }
  return o + `<g${op(s.e.forceNuage)}>${nuages}</g>`
}

/** Ligne de crête sur toute la largeur, fermée vers le bas. */
function crete(ra: Alea, yBase: number, amp: number, pas: number, lisse: boolean, bas = H): string {
  const p1 = ra.entre(0, 6.28)
  const p2 = ra.entre(0, 6.28)
  const p3 = ra.entre(0, 6.28)
  const f1 = ra.entre(1.1, 2.1)
  const f2 = ra.entre(3, 5.5)
  const f3 = ra.entre(7, 12)
  const points: [number, number][] = []
  for (let x = -pas; x <= L + pas; x += pas) {
    const k = (x / L) * 6.283
    const h = 0.5 + 0.32 * Math.sin(k * f1 + p1) + 0.13 * Math.sin(k * f2 + p2) + 0.05 * Math.sin(k * f3 + p3)
    const bruit = lisse ? 0 : ra.entre(-0.12, 0.12)
    points.push([x, yBase - amp * (h + bruit)])
  }
  let d = `M${nb(points[0][0])} ${nb(points[0][1])}`
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]
    if (lisse && i < points.length - 1) {
      const [x2, y2] = points[i + 1]
      d += `Q${nb(x)} ${nb(y)} ${nb((x + x2) / 2)} ${nb((y + y2) / 2)}`
    } else {
      d += `L${nb(x)} ${nb(y)}`
    }
  }
  return d + `L${nb(L + pas)} ${nb(bas)}L${nb(-pas)} ${nb(bas)}Z`
}

// ───────────────────────── Formes d'architecture ─────────────────────────

/** Hauteur de la partie cintrée d'une arche. */
function fleche(forme: FormeArc, l: number, h: number): number {
  switch (forme) {
    case 'ogive': return Math.min(h * 0.5, l * 0.86)
    case 'plein': return Math.min(h * 0.7, l / 2)
    case 'bas': return Math.min(h * 0.4, l * 0.24)
    case 'pans': return Math.min(h * 0.3, l * 0.2)
    default: return 0
  }
}

/** Tracé fermé d'une arche posée sur y (bas), large de l et haute de h. */
function arche(forme: FormeArc, x: number, y: number, l: number, h: number): string {
  const f = fleche(forme, l, h)
  const yh = y - h
  const yn = yh + f
  const xd = x + l
  const xm = x + l / 2
  const bas = `L${nb(xd)} ${nb(y)}L${nb(x)} ${nb(y)}Z`
  switch (forme) {
    case 'ogive':
      return `M${nb(x)} ${nb(yn)}C${nb(x)} ${nb(yn - f * 0.55)} ${nb(x + l * 0.26)} ${nb(yh + f * 0.2)} ${nb(xm)} ${nb(yh)}C${nb(xd - l * 0.26)} ${nb(yh + f * 0.2)} ${nb(xd)} ${nb(yn - f * 0.55)} ${nb(xd)} ${nb(yn)}${bas}`
    case 'plein':
      return `M${nb(x)} ${nb(yn)}A${nb(l / 2)} ${nb(f)} 0 0 1 ${nb(xd)} ${nb(yn)}${bas}`
    case 'bas':
      return `M${nb(x)} ${nb(yn)}Q${nb(xm)} ${nb(yn - 2 * f)} ${nb(xd)} ${nb(yn)}${bas}`
    case 'pans':
      return `M${nb(x)} ${nb(yn)}L${nb(x + f)} ${nb(yh)}L${nb(xd - f)} ${nb(yh)}L${nb(xd)} ${nb(yn)}${bas}`
    default:
      return `M${nb(x)} ${nb(yh)}L${nb(xd)} ${nb(yh)}${bas}`
  }
}

/** Toit posé sur le segment [x, x+l] à la hauteur y, selon le thème. */
function toiture(theme: ThemeArt, x: number, y: number, l: number, h: number): string {
  switch (theme) {
    case 'orientale':
      return `M${nb(x - l * 0.14)} ${nb(y - h * 0.2)}Q${nb(x + l * 0.14)} ${nb(y - h * 0.08)} ${nb(x + l * 0.3)} ${nb(y - h)}L${nb(x + l * 0.7)} ${nb(y - h)}Q${nb(x + l * 0.86)} ${nb(y - h * 0.08)} ${nb(x + l * 1.14)} ${nb(y - h * 0.2)}L${nb(x + l * 1.05)} ${nb(y)}L${nb(x - l * 0.05)} ${nb(y)}Z`
    case 'gothique':
      return pts(x - l * 0.04, y, x + l / 2, y - h * 1.7, x + l * 1.04, y)
    case 'steampunk':
      return pts(x - l * 0.04, y, x + l * 0.1, y - h, x + l * 0.9, y - h, x + l * 1.04, y)
    case 'moderne':
      return pts(x - l * 0.02, y, x - l * 0.02, y - h * 0.16, x + l * 1.02, y - h * 0.16, x + l * 1.02, y)
    default:
      return pts(x - l * 0.07, y, x + l / 2, y - h, x + l * 1.07, y)
  }
}

function engrenage(cx: number, cy: number, r: number, dents: number): string {
  let d = ''
  const n = dents * 4
  for (let i = 0; i < n; i++) {
    const ang = ((i - 0.5) / n) * Math.PI * 2
    const rr = i % 4 < 2 ? r : r * 0.8
    d += (i ? 'L' : 'M') + nb(cx + Math.cos(ang) * rr) + ' ' + nb(cy + Math.sin(ang) * rr)
  }
  return d + 'Z' + disque(cx, cy, r * 0.3)
}

const PAIR = ' fill-rule="evenodd"'

// ───────────────────────── Végétation ─────────────────────────

type Essence = 'feuillu' | 'conifere' | 'fleuri' | 'nu'

function essenceTheme(theme: ThemeArt): Essence {
  if (theme === 'orientale') return 'fleuri'
  if (theme === 'gothique') return 'nu'
  return 'feuillu'
}

function arbre(s: Scene, ra: Alea, cx: number, ySol: number, h: number, prof: number, essence: Essence): string {
  const tronc = s.c(assombrir(s.p.bois, 0.2), prof)
  const lt = h * 0.065
  let o = ''
  if (essence === 'conifere') {
    const vert = s.c(assombrir(s.p.feuillage, 0.28), prof)
    const clair = s.c(assombrir(s.p.feuillage, 0.1), prof)
    o += rect(cx - lt * 0.5, ySol - h * 0.18, lt, h * 0.18, tronc)
    for (let i = 0; i < 4; i++) {
      const yb = ySol - h * (0.12 + i * 0.2)
      const l = h * (0.24 - i * 0.045)
      const ht = h * 0.34
      o += chemin(pts(cx - l, yb, cx, yb - ht, cx + l, yb), vert)
      o += chemin(pts(cx - l, yb, cx, yb - ht, cx - l * 0.1, yb), clair, op(0.6))
    }
    return o
  }
  const penche = ra.entre(-0.06, 0.06) * h
  const yc = ySol - h * 0.68
  o += chemin(
    `M${nb(cx - lt)} ${nb(ySol)}Q${nb(cx - lt * 0.5)} ${nb(ySol - h * 0.3)} ${nb(cx + penche - lt * 0.4)} ${nb(yc)}L${nb(cx + penche + lt * 0.4)} ${nb(yc)}Q${nb(cx + lt * 0.5)} ${nb(ySol - h * 0.3)} ${nb(cx + lt)} ${nb(ySol)}Z`,
    tronc,
  )
  if (essence === 'nu') {
    // Branches nues : trois niveaux de ramifications.
    let d = ''
    const branche = (x: number, y: number, ang: number, long: number, niveau: number): void => {
      const x2 = x + Math.cos(ang) * long
      const y2 = y + Math.sin(ang) * long
      d += `M${nb(x)} ${nb(y)}L${nb(x2)} ${nb(y2)}`
      if (niveau <= 0) return
      branche(x2, y2, ang - ra.entre(0.3, 0.7), long * 0.66, niveau - 1)
      branche(x2, y2, ang + ra.entre(0.3, 0.7), long * 0.66, niveau - 1)
    }
    for (let i = 0; i < 4; i++) branche(cx + penche, yc + h * 0.04, -Math.PI / 2 + (i - 1.5) * 0.55, h * 0.17, 3)
    return o + trait(d, tronc, Math.max(1.5, lt * 0.3))
  }
  const base = essence === 'fleuri' ? '#e58aa6' : s.p.feuillage
  const sombre = s.c(assombrir(base, 0.3), prof)
  const moyen = s.c(base, prof)
  const clair = s.c(eclaircir(ajuster(base, -8, 6, 0), 0.22), prof)
  let m1 = ''
  let m2 = ''
  let m3 = ''
  const n = 7
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + ra.entre(-0.3, 0.3)
    const d = h * ra.entre(0.1, 0.2)
    const r = h * ra.entre(0.13, 0.19)
    const x = cx + penche + Math.cos(ang) * d * 1.35
    const y = yc - h * 0.05 + Math.sin(ang) * d * 0.9
    m1 += disque(x, y + r * 0.22, r)
    m2 += disque(x - r * 0.12, y - r * 0.08, r * 0.82)
    if (i % 2 === 0) m3 += disque(x - r * 0.3, y - r * 0.34, r * 0.42)
  }
  m1 += disque(cx + penche, yc - h * 0.04, h * 0.2)
  m2 += disque(cx + penche - h * 0.02, yc - h * 0.07, h * 0.17)
  return o + chemin(m1, sombre) + chemin(m2, moyen) + chemin(m3, clair, op(0.75))
}

/** Touffes d'herbe ou de roseaux le long d'une ligne de sol. */
function touffes(ra: Alea, x0: number, x1: number, y: number, hauteur: number, densite: number): string {
  let d = ''
  for (let x = x0; x < x1; x += densite * ra.entre(0.6, 1.4)) {
    const h = hauteur * ra.entre(0.5, 1)
    const pli = ra.entre(-0.5, 0.5) * h
    d += `M${nb(x - 3)} ${nb(y)}Q${nb(x + pli * 0.3)} ${nb(y - h * 0.6)} ${nb(x + pli)} ${nb(y - h)}Q${nb(x + pli * 0.4 + 3)} ${nb(y - h * 0.5)} ${nb(x + 4)} ${nb(y)}Z`
  }
  return d
}

// ───────────────────────── Éléments d'intérieur ─────────────────────────

function fuyantes(yHaut: number, yBas: number, vpx: number, vpy: number, pas: number): string {
  let d = ''
  const t = (yBas - yHaut) / (yBas - vpy)
  for (let i = -14; i <= 14; i++) {
    const xb = vpx + i * pas
    d += `M${nb(xb)} ${nb(yBas)}L${nb(xb + (vpx - xb) * t)} ${nb(yHaut)}`
  }
  return d
}

function traverses(yHaut: number, yBas: number, vpy: number): string {
  let d = ''
  for (let k = 1.12; k < 40; k *= 1.42) {
    const y = vpy + (yBas - vpy) / k
    if (y <= yHaut + 3) break
    d += `M0 ${nb(y)}H${L}`
  }
  return d
}

function mur(s: Scene, ySol: number, yLambris: number): string {
  const p = s.p
  let o = rect(0, 0, L, ySol, s.t.lineaire(0, 0, 0, ySol, [
    [0, s.c(assombrir(p.mur, 0.3))], [0.3, s.c(assombrir(p.mur, 0.06))], [1, s.c(p.mur)],
  ]))
  if (s.theme === 'gothique' || s.theme === 'libre') {
    // Appareil de pierre discret.
    let d = ''
    for (let y = 60, rang = 0; y < yLambris; y += 64, rang++) {
      d += `M0 ${y}H${L}`
      for (let x = rang % 2 ? 70 : 150; x < L; x += 160) d += `M${x} ${y}v64`
    }
    o += trait(d, s.c(assombrir(p.mur, 0.4)), 2, op(0.22))
  } else if (s.theme === 'steampunk') {
    o += rect(0, 46, L, 26, s.c(assombrir(p.metal, 0.35)))
    let rivets = ''
    for (let x = 30; x < L; x += 60) rivets += disque(x, 59, 4)
    o += chemin(rivets, s.c(eclaircir(p.metal, 0.15)))
  } else if (s.theme === 'orientale') {
    o += rect(0, 0, L, 30, s.c(p.bois)) + rect(0, 30, L, 8, s.c(assombrir(p.bois, 0.3)))
  } else if (s.theme === 'fantasy') {
    o += rect(0, 0, L, 34, s.c(p.bois)) + rect(0, 34, L, 6, s.c(assombrir(p.bois, 0.35)), op(0.6))
  }
  o += rect(0, yLambris, L, ySol - yLambris, s.c(p.boiserie))
  o += rect(0, yLambris, L, 9, s.c(eclaircir(p.boiserie, 0.2)))
  let d = ''
  for (let x = 40; x < L; x += 152) d += `M${x} ${nb(yLambris + 24)}V${nb(ySol - 26)}`
  o += trait(d, s.c(assombrir(p.boiserie, 0.35)), 3, op(0.45))
  o += rect(0, ySol - 14, L, 14, s.c(assombrir(p.boiserie, 0.3)))
  return o
}

function plancher(s: Scene, ySol: number, couleur: string, vpy = 380): string {
  let o = rect(0, ySol, L, H - ySol, s.t.lineaire(0, ySol, 0, H, [[0, s.c(eclaircir(couleur, 0.06))], [1, s.c(assombrir(couleur, 0.3))]]))
  o += trait(fuyantes(ySol, H, 800, vpy, 150) + traverses(ySol, H, vpy), s.c(assombrir(couleur, 0.45)), 2, op(0.3))
  return o
}

interface Baie { x: number; y: number; l: number; h: number }

/** Fenêtres d'intérieur : on voit le ciel au travers ; la lumière qui entre est rangée dans s.rayons. */
function fenetres(s: Scene, baies: Baie[], horizon: number, sol?: { y0: number; y1: number }): string {
  const forme = s.p.arc
  const cadre = s.c(s.theme === 'moderne' ? '#f6f6f4' : assombrir(s.p.bois, 0.15))
  const pierre = s.c(eclaircir(s.p.mur, 0.12))
  let o = ''
  for (const b of baies) o += chemin(arche(forme, b.x - 16, b.y + 12, b.l + 32, b.h + 18), pierre)

  const rv = creerAlea(deriver(s.graine, 'vue'))
  const dehors = { ...s, interieur: false, c: (c: string, pr = 0) => melanger(multiplier(c, s.e.ambiante), s.e.brume, pr) }
  let vue = ciel(dehors, horizon)
  vue += chemin(crete(rv, horizon - 20, 110, 90, true, horizon + 90), dehors.c(s.p.feuillage, 0.62))
  vue += chemin(crete(rv, horizon + 22, 70, 60, true, horizon + 90), dehors.c(assombrir(s.p.feuillage, 0.2), 0.34))
  o += `<g${s.t.decoupe(baies.map((b) => chemin(arche(forme, b.x, b.y, b.l, b.h), '#000')).join(''))}>${vue}</g>`

  const k = s.e.forceRayon
  for (const b of baies) {
    const f = fleche(forme, b.l, b.h)
    const xm = b.x + b.l / 2
    let d = `M${nb(xm)} ${nb(b.y - b.h)}V${nb(b.y)}`
    const nTrav = s.theme === 'orientale' ? 5 : s.theme === 'moderne' ? 1 : 3
    for (let i = 1; i <= nTrav; i++) {
      const y = b.y - ((b.h - f) * i) / (nTrav + 1)
      d += `M${nb(b.x)} ${nb(y)}H${nb(b.x + b.l)}`
    }
    if (s.theme === 'orientale') d += `M${nb(b.x + b.l * 0.25)} ${nb(b.y - b.h + f)}V${nb(b.y)}M${nb(b.x + b.l * 0.75)} ${nb(b.y - b.h + f)}V${nb(b.y)}`
    if (forme !== 'rect' && forme !== 'pans') d += `M${nb(b.x)} ${nb(b.y - b.h + f)}H${nb(b.x + b.l)}`
    o += trait(d, cadre, s.theme === 'moderne' ? 4 : 6)
    if (s.theme === 'gothique') o += trait(disque(xm, b.y - b.h + f * 0.62, b.l * 0.16), cadre, 5)
    o += trait(arche(forme, b.x, b.y, b.l, b.h), cadre, s.theme === 'moderne' ? 6 : 10)
    o += rect(b.x - 22, b.y, b.l + 44, 14, s.c(eclaircir(s.p.mur, 0.2)))
    if (s.theme === 'steampunk') {
      let rivets = ''
      for (let y = b.y - 12; y > b.y - b.h + f; y -= 44) rivets += disque(b.x, y, 3.5) + disque(b.x + b.l, y, 3.5)
      o += chemin(rivets, s.c(eclaircir(s.p.metal, 0.1)))
    }
    if (sol) {
      const dx = -s.sens * 150
      const yp = sol.y0 + (sol.y1 - sol.y0) * 0.62
      const haut = b.y - b.h * 0.88
      const g = s.t.lineaire(xm, haut, xm + dx, yp, [[0, s.e.rayon, 0.3 * k], [1, s.e.rayon, 0.03 * k]])
      s.rayons.push(chemin(pts(b.x, haut, b.x + b.l, haut, b.x + b.l * 1.2 + dx * 1.5, yp, b.x - b.l * 0.2 + dx * 1.5, yp), g))
      s.rayons.push(chemin(
        pts(b.x + dx * 0.45, sol.y0 + 10, b.x + b.l + dx * 0.45, sol.y0 + 10, b.x + b.l * 1.2 + dx * 1.5, yp, b.x - b.l * 0.2 + dx * 1.5, yp),
        s.e.rayon, op(0.2 * k),
      ))
    }
  }
  return o
}

/** Luminaire suspendu ou posé, selon le thème. Allumé au crépuscule et la nuit. */
function lampe(s: Scene, x: number, y: number, e = 1, yAttache = 0): string {
  const allume = s.e.lampes > 0
  const fer = s.c(assombrir(s.p.metal, 0.6))
  const feu = s.p.lampe
  let o = ''
  if (yAttache < y) o += trait(ligne(x, yAttache, x, y), fer, 3 * e)
  let yc = y + 30 * e
  if (s.theme === 'orientale') {
    o += ellipse(x, yc, 25 * e, 31 * e, allume ? melanger(s.p.tissu, feu, 0.6) : s.c(s.p.tissu))
    o += trait(`M${nb(x - 12 * e)} ${nb(y + 2 * e)}Q${nb(x - 22 * e)} ${nb(yc)} ${nb(x - 12 * e)} ${nb(y + 58 * e)}M${nb(x + 12 * e)} ${nb(y + 2 * e)}Q${nb(x + 22 * e)} ${nb(yc)} ${nb(x + 12 * e)} ${nb(y + 58 * e)}M${nb(x)} ${nb(y)}V${nb(y + 60 * e)}`, '#000000', 1.5 * e, op(0.18))
    o += rect(x - 12 * e, y - 4 * e, 24 * e, 8 * e, fer) + rect(x - 12 * e, y + 56 * e, 24 * e, 8 * e, fer)
    o += trait(ligne(x, y + 64 * e, x, y + 88 * e), s.c(s.p.metal), 3 * e)
  } else if (s.theme === 'steampunk') {
    yc = y + 34 * e
    o += rect(x - 10 * e, y, 20 * e, 16 * e, s.c(s.p.metal))
    o += cercle(x, yc, 20 * e, allume ? '#fff0bd' : s.c('#d9ceb2'))
    o += trait(`M${nb(x - 20 * e)} ${nb(yc)}H${nb(x + 20 * e)}M${nb(x)} ${nb(y + 14 * e)}V${nb(yc + 20 * e)}` + disque(x, yc, 20 * e), fer, 2.5 * e)
  } else if (s.theme === 'moderne') {
    yc = y + 30 * e
    o += chemin(pts(x - 8 * e, y, x + 8 * e, y, x + 36 * e, y + 30 * e, x - 36 * e, y + 30 * e), s.c('#2f343c'))
    o += ellipse(x, y + 30 * e, 34 * e, 6 * e, allume ? '#fff5d9' : s.c('#c8ccd3'))
  } else {
    // Lustre à bougies.
    yc = y + 14 * e
    o += trait(ligne(x, y, x - 52 * e, y + 30 * e) + ligne(x, y, x + 52 * e, y + 30 * e), fer, 2.5 * e)
    o += trait(`M${nb(x - 56 * e)} ${nb(y + 30 * e)}a${nb(56 * e)} ${nb(10 * e)} 0 0 0 ${nb(112 * e)} 0`, fer, 6 * e)
    for (const dx of [-54, -18, 18, 54]) {
      const bx = x + dx * e
      const by = y + (Math.abs(dx) > 30 ? 12 : 20) * e
      o += rect(bx - 4 * e, by, 8 * e, 18 * e, s.c('#f1e7d0'))
      if (allume) o += ellipse(bx, by - 7 * e, 4 * e, 8 * e, '#fff3c2')
    }
  }
  if (allume) {
    halo(s, x, yc, 210 * e, feu, 0.8 * s.e.lampes)
    halo(s, x, yc, 60 * e, '#fff8e0', 0.7 * s.e.lampes)
  }
  return o
}

/** Lanterne sur pied (extérieur). */
function lampadaire(s: Scene, x: number, ySol: number, h: number, prof = 0): string {
  const allume = s.e.lampes > 0
  const fer = s.c(assombrir(s.p.metal, 0.62), prof)
  const yt = ySol - h
  const l = h * 0.09
  let o = rect(x - l * 0.18, yt + l * 2, l * 0.36, h - l * 2, fer) + rect(x - l * 0.6, ySol - l * 0.5, l * 1.2, l * 0.5, fer)
  const vitre = allume ? '#ffe2a0' : s.c('#9fb0c0', prof)
  if (s.theme === 'orientale') {
    o += chemin(pts(x - l * 1.5, yt + l * 0.2, x, yt - l * 0.9, x + l * 1.5, yt + l * 0.2), fer)
    o += rect(x - l * 0.85, yt + l * 0.2, l * 1.7, l * 1.7, vitre) + rect(x - l * 1.1, yt + l * 1.9, l * 2.2, l * 0.35, fer)
  } else if (s.theme === 'moderne') {
    o += rect(x - l * 1.6, yt + l * 0.9, l * 3.2, l * 0.5, fer, ` rx="${nb(l * 0.25)}"`) + rect(x - l * 1.3, yt + l * 1.4, l * 2.6, l * 0.3, vitre)
  } else {
    o += chemin(pts(x - l * 0.6, yt + l * 2, x - l, yt + l * 0.5, x + l, yt + l * 0.5, x + l * 0.6, yt + l * 2), vitre)
    o += chemin(pts(x - l * 1.3, yt + l * 0.5, x, yt - l * 0.5, x + l * 1.3, yt + l * 0.5), fer) + cercle(x, yt - l * 0.6, l * 0.25, fer)
  }
  if (allume) {
    halo(s, x, yt + l * 1.2, h * 0.85, s.p.lampe, 0.75 * s.e.lampes)
    halo(s, x, yt + l * 1.2, h * 0.22, '#fff8e0', 0.7 * s.e.lampes)
  }
  return o
}

/** Décoration murale propre au thème. */
function ornement(s: Scene, x: number, y: number, e: number): string {
  const p = s.p
  switch (s.theme) {
    case 'fantasy': {
      const l = 70 * e
      const h = 190 * e
      return rect(x - l * 0.62, y - 6 * e, l * 1.24, 7 * e, s.c(p.metal))
        + chemin(pts(x - l / 2, y, x + l / 2, y, x + l / 2, y + h, x, y + h - 30 * e, x - l / 2, y + h), s.c(p.tissu))
        + chemin(pts(x - l / 2, y, x - l / 2 + 9 * e, y, x - l / 2 + 9 * e, y + h - 9 * e, x - l / 2, y + h), s.c(p.metal), op(0.8))
        + chemin(pts(x + l / 2, y, x + l / 2 - 9 * e, y, x + l / 2 - 9 * e, y + h - 9 * e, x + l / 2, y + h), s.c(p.metal), op(0.8))
        + chemin(pts(x, y + 46 * e, x + 17 * e, y + 76 * e, x, y + 106 * e, x - 17 * e, y + 76 * e), s.c(p.metal))
    }
    case 'gothique': {
      const l = 96 * e
      const h = 170 * e
      return chemin(arche('ogive', x - l / 2 - 9 * e, y + h + 9 * e, l + 18 * e, h + 18 * e), s.c(assombrir(p.bois, 0.25)))
        + chemin(arche('ogive', x - l / 2, y + h, l, h), s.c(assombrir(p.tissu, 0.45)))
        + ellipse(x, y + h * 0.5, l * 0.2, l * 0.26, s.c(eclaircir(p.mur, 0.1)), op(0.55))
        + chemin(pts(x - l * 0.34, y + h, x - l * 0.2, y + h * 0.68, x + l * 0.2, y + h * 0.68, x + l * 0.34, y + h), s.c(assombrir(p.accent, 0.5)), op(0.9))
    }
    case 'orientale': {
      const l = 84 * e
      const h = 210 * e
      return rect(x - l / 2 - 8 * e, y - 6 * e, l + 16 * e, 8 * e, s.c(p.bois))
        + rect(x - l / 2, y, l, h, s.c('#f3ead6'))
        + trait(`M${nb(x + 20 * e)} ${nb(y + 60 * e)}A${nb(24 * e)} ${nb(24 * e)} 0 1 0 ${nb(x + 14 * e)} ${nb(y + 96 * e)}`, s.c('#2c2a2e'), 7 * e, op(0.85))
        + trait(ligne(x - 14 * e, y + 130 * e, x - 14 * e, y + 178 * e) + ligne(x + 2 * e, y + 136 * e, x + 2 * e, y + 166 * e), s.c('#2c2a2e'), 4 * e, op(0.7))
        + rect(x + 14 * e, y + 172 * e, 14 * e, 14 * e, s.c(p.tissu))
        + rect(x - l / 2 - 8 * e, y + h, l + 16 * e, 8 * e, s.c(p.bois))
    }
    case 'steampunk': {
      const cuivre = s.c(p.metal)
      return chemin(engrenage(x - 20 * e, y + 60 * e, 56 * e, 10), cuivre, PAIR)
        + chemin(engrenage(x + 46 * e, y + 112 * e, 36 * e, 8), s.c(assombrir(p.metal, 0.25)), PAIR)
        + cercle(x + 40 * e, y + 22 * e, 27 * e, s.c('#efe4c8')) + trait(disque(x + 40 * e, y + 22 * e, 27 * e), s.c(assombrir(p.metal, 0.4)), 5 * e)
        + trait(ligne(x + 40 * e, y + 22 * e, x + 54 * e, y + 8 * e), s.c('#7a2a22'), 3 * e)
    }
    case 'moderne': {
      const l = 150 * e
      const h = 190 * e
      return rect(x - l / 2, y, l, h, s.c('#fafaf8'))
        + cercle(x - l * 0.1, y + h * 0.42, l * 0.26, s.c(p.accent))
        + rect(x - l * 0.02, y + h * 0.5, l * 0.38, h * 0.36, s.c(p.tissu))
        + trait(ligne(x - l * 0.36, y + h * 0.8, x + l * 0.3, y + h * 0.2), s.c('#22262c'), 3 * e)
        + trait(pts(x - l / 2, y, x + l / 2, y, x + l / 2, y + h, x - l / 2, y + h), s.c('#22262c'), 5 * e)
    }
    default: {
      const l = 170 * e
      const h = 120 * e
      return rect(x - l / 2 - 9 * e, y - 9 * e, l + 18 * e, h + 18 * e, s.c(p.metal))
        + rect(x - l / 2, y, l, h, s.c('#bcd6e6'))
        + chemin(pts(x - l / 2, y + h, x - l * 0.2, y + h * 0.4, x + l * 0.05, y + h * 0.7, x + l * 0.25, y + h * 0.5, x + l / 2, y + h), s.c(p.feuillage))
        + cercle(x + l * 0.26, y + h * 0.26, 11 * e, s.c('#fff3c8'))
    }
  }
}

/** Tuyauterie de plafond (thème steampunk). */
function tuyaux(s: Scene, y: number): string {
  if (s.theme !== 'steampunk') return ''
  const cuivre = s.c(s.p.metal)
  const ombre = s.c(assombrir(s.p.metal, 0.4))
  let o = rect(0, y, L, 16, cuivre) + rect(0, y + 11, L, 5, ombre, op(0.6)) + rect(0, y + 30, L, 9, ombre)
  for (let x = 110; x < L; x += 290) o += rect(x, y - 4, 16, 24, ombre)
  return o
}

function rayonnage(s: Scene, ra: Alea, x: number, y: number, l: number, h: number, rangs: number): string {
  const p = s.p
  const teintes = [p.tissu, p.accent, ajuster(p.tissu, 38, -12, -6), assombrir(p.metal, 0.25), eclaircir(p.boiserie, 0.3), '#40505f', '#e5dbc2', assombrir(p.feuillage, 0.25)].map((c) => s.c(c))
  let o = rect(x - 12, y - 16, l + 24, 22, s.c(eclaircir(p.bois, 0.1))) + rect(x, y, l, h, s.c(assombrir(p.bois, 0.55)))
  const hr = h / rangs
  const lot = new Lot()
  for (let r = 0; r < rangs; r++) {
    const yb = y + (r + 1) * hr - 9
    let bx = x + 14
    while (bx < x + l - 26) {
      const lb = ra.entre(9, 21)
      const hb = (hr - 16) * ra.entre(0.62, 0.96)
      const vide = ra.chance(0.07)
      const c = ra.choix(teintes)
      if (!vide) lot.rect(bx, yb - hb, lb - 1.5, hb, c)
      bx += vide ? lb * 2 : lb
    }
  }
  o += lot.rendu()
  for (let r = 0; r <= rangs; r++) o += rect(x, y + r * hr - 9 + (r === 0 ? 9 : 0), l, 9, s.c(p.bois))
  o += rect(x - 9, y, 12, h, s.c(p.bois)) + rect(x + l - 3, y, 12, h, s.c(p.bois))
  return o
}

function banniere(s: Scene, x: number, y: number, l: number, h: number, couleur: string): string {
  return rect(x - l * 0.62, y - 6, l * 1.24, 7, s.c(s.p.metal))
    + chemin(pts(x - l / 2, y, x + l / 2, y, x + l / 2, y + h, x, y + h - l * 0.45, x - l / 2, y + h), s.c(couleur))
    + rect(x - l * 0.12, y, l * 0.24, h - l * 0.34, s.c(s.p.metal), op(0.75))
}

// ───────────────────────── Scènes d'intérieur ─────────────────────────

function pupitre(s: Scene, cx: number, y: number, e: number, chaise: boolean): string {
  const p = s.p
  let o = ''
  o += rect(cx - 86 * e, y + 60 * e, 10 * e, 78 * e, s.c(assombrir(p.bois, 0.4))) + rect(cx + 76 * e, y + 60 * e, 10 * e, 78 * e, s.c(assombrir(p.bois, 0.4)))
  o += rect(cx - 92 * e, y + 15 * e, 184 * e, 48 * e, s.c(assombrir(p.bois, 0.12)))
  o += chemin(pts(cx - 88 * e, y, cx + 88 * e, y, cx + 100 * e, y + 17 * e, cx - 100 * e, y + 17 * e), s.c(eclaircir(p.bois, 0.22)))
  if (chaise) {
    const d = s.c(assombrir(p.bois, 0.3))
    o += rect(cx - 36 * e, y + 34 * e, 8 * e, 104 * e, d) + rect(cx + 28 * e, y + 34 * e, 8 * e, 104 * e, d)
    o += rect(cx - 42 * e, y + 22 * e, 84 * e, 42 * e, s.c(assombrir(p.bois, 0.2)), ` rx="${nb(9 * e)}"`)
    o += rect(cx - 46 * e, y + 92 * e, 92 * e, 10 * e, d)
  }
  return o
}

function salle(s: Scene): string {
  const ySol = 612
  const yL = 482
  let o = mur(s, ySol, yL) + tuyaux(s, 86)
  o += fenetres(s, [{ x: 86, y: yL, l: 196, h: 392 }, { x: 392, y: yL, l: 196, h: 392 }, { x: 1318, y: yL, l: 196, h: 392 }], 530, { y0: ySol, y1: H })
  // Tableau.
  const tx = 706
  const ty = 172
  const tl = 500
  const th = 250
  const clair = s.theme === 'moderne'
  o += rect(tx - 13, ty - 13, tl + 26, th + 26, s.c(clair ? '#8c95a1' : s.p.bois))
  o += rect(tx, ty, tl, th, s.c(clair ? '#f7f8f9' : '#2f4d42'))
  let craie = ''
  for (let i = 0; i < 5; i++) {
    const y = ty + 40 + i * 38
    const x0 = tx + 34 + s.a.entre(0, 40)
    craie += `M${nb(x0)} ${nb(y)}h${nb(s.a.entre(120, 300))}`
  }
  o += trait(craie, clair ? s.c('#3b4654') : '#ffffff', 5, ` stroke-dasharray="${nb(s.a.entre(26, 50))} 14 ${nb(s.a.entre(50, 90))} 18"${op(clair ? 0.55 : 0.4)}`)
  o += trait(disque(tx + tl - 92, ty + 150, 40) + ligne(tx + tl - 92, ty + 110, tx + tl - 92, ty + 190) + ligne(tx + tl - 132, ty + 150, tx + tl - 52, ty + 150), clair ? s.c(s.p.accent) : '#ffffff', 3, op(clair ? 0.7 : 0.4))
  o += rect(tx - 13, ty + th + 13, tl + 26, 9, s.c(assombrir(s.p.bois, 0.3)))
  o += ornement(s, 1262, 150, 0.62)
  o += plancher(s, ySol, s.p.sol) + s.rayons.join('')
  o += lampe(s, 338, 96, 1) + lampe(s, 1262, 60, 0.9)
  // Estrade et bureau du maître.
  o += rect(600, ySol - 6, 720, 22, s.c(assombrir(s.p.bois, 0.1)))
  // Pupitres : deux rangées, l'allée centrale reste libre.
  for (const cx of [150, 430, 1170, 1450]) o += pupitre(s, cx, 648, 0.78, true)
  for (const cx of [90, 470, 1130, 1510]) o += pupitre(s, cx, 770, 1.25, false)
  return o
}

function bibliotheque(s: Scene): string {
  const ySol = 622
  let o = mur(s, ySol, 560)
  o += fenetres(s, [{ x: 660, y: 540, l: 280, h: 440 }], 560, { y0: ySol, y1: H })
  o += rayonnage(s, s.a, 50, 70, 500, 552, 7) + rayonnage(s, s.a, 1050, 70, 500, 552, 7)
  o += plancher(s, ySol, s.p.sol)
  // Tapis central.
  o += chemin(pts(560, H, 1040, H, 900, ySol + 8, 700, ySol + 8), s.c(s.p.tissu), op(0.92))
  o += trait(ligne(600, H, 716, ySol + 8) + ligne(1000, H, 884, ySol + 8), s.c(s.p.metal), 4, op(0.7))
  o += s.rayons.join('')
  // Échelle appuyée sur les rayonnages.
  const ex = 330
  const bois = s.c(eclaircir(s.p.bois, 0.28))
  let d = ligne(ex - 30, 672, ex + 44, 104) + ligne(ex + 62, 672, ex + 122, 104)
  for (let i = 0; i < 10; i++) {
    const t = (i + 0.6) / 10.5
    d += ligne(ex - 30 + 74 * t, 672 - 568 * t, ex + 62 + 60 * t, 672 - 568 * t)
  }
  o += trait(d, bois, 8)
  o += lampe(s, 800, 26, 1.15) + lampe(s, 600, 250, 0.01, 250)
  // Table de lecture au premier plan.
  o += rect(1120, 716, 440, 22, s.c(eclaircir(s.p.bois, 0.15))) + rect(1140, 738, 400, 170, s.c(assombrir(s.p.bois, 0.2)))
  const livres = new Lot()
  livres.rect(1190, 696, 120, 20, s.c(s.p.tissu))
  livres.rect(1200, 678, 104, 18, s.c(s.p.accent))
  livres.rect(1206, 662, 92, 16, s.c('#e5dbc2'))
  o += livres.rendu()
  // Lampe de table.
  const allume = s.e.lampes > 0
  o += rect(1436, 660, 8, 56, s.c(assombrir(s.p.metal, 0.4))) + rect(1416, 710, 48, 8, s.c(assombrir(s.p.metal, 0.4)))
  o += chemin(pts(1414, 664, 1466, 664, 1454, 630, 1426, 630), allume ? melanger(s.p.accent, '#fff0c0', 0.6) : s.c(s.p.accent))
  if (allume) halo(s, 1440, 660, 190, s.p.lampe, 0.8 * s.e.lampes)
  return o
}

function lit(s: Scene, x: number, y: number, l: number, couverture: string): string {
  const p = s.p
  const bois = s.c(p.bois)
  let o = ''
  o += rect(x + 14, y + 66, l - 8, 34, s.c(assombrir(p.bois, 0.6)), op(0.7))
  o += rect(x, y - 132, 30, 250, bois, ' rx="8"') + cercle(x + 15, y - 136, 15, bois)
  o += rect(x + 22, y - 4, l - 20, 50, s.c('#f1eadc'), ' rx="10"')
  o += rect(x + 34, y - 32, 118, 38, s.c('#fdf9f0'), ' rx="17"')
  o += chemin(`M${nb(x + 176)} ${nb(y - 10)}Q${nb(x + l * 0.6)} ${nb(y - 22)} ${nb(x + l + 4)} ${nb(y - 8)}V${nb(y + 66)}H${nb(x + 176)}Z`, s.c(couverture))
  o += chemin(`M${nb(x + 176)} ${nb(y - 10)}h30v76h-30Z`, s.c(eclaircir(couverture, 0.3)))
  o += rect(x + 10, y + 46, l + 2, 26, bois) + rect(x + l - 4, y - 44, 24, 150, bois, ' rx="7"')
  o += rect(x + 4, y + 72, 16, 34, s.c(assombrir(p.bois, 0.3))) + rect(x + l, y + 72, 16, 34, s.c(assombrir(p.bois, 0.3)))
  return o
}

function chevet(s: Scene, x: number, y: number): string {
  const allume = s.e.lampes > 0
  let o = rect(x, y, 96, 106, s.c(assombrir(s.p.bois, 0.1))) + rect(x - 5, y - 8, 106, 10, s.c(eclaircir(s.p.bois, 0.15)))
  o += rect(x + 10, y + 16, 76, 34, s.c(assombrir(s.p.bois, 0.3))) + cercle(x + 48, y + 33, 4, s.c(s.p.metal))
  o += rect(x + 44, y - 44, 8, 38, s.c(assombrir(s.p.metal, 0.3)))
  o += chemin(pts(x + 22, y - 40, x + 74, y - 40, x + 62, y - 78, x + 34, y - 78), allume ? melanger(s.p.tissu, '#fff0c0', 0.65) : s.c(eclaircir(s.p.tissu, 0.4)))
  if (allume) halo(s, x + 48, y - 54, 200, s.p.lampe, 0.8 * s.e.lampes)
  return o
}

function dortoir(s: Scene): string {
  const ySol = 640
  let o = mur(s, ySol, 520)
  o += fenetres(s, [{ x: 664, y: 486, l: 272, h: 366 }], 500, { y0: ySol, y1: H })
  // Rideaux.
  const rideau = s.c(s.p.tissu)
  const pli = s.c(assombrir(s.p.tissu, 0.25))
  o += rect(616, 92, 368, 12, s.c(s.p.metal))
  for (const [x, sens] of [[628, 1], [972, -1]] as const) {
    o += chemin(`M${x} 100Q${nb(x + sens * 78)} 300 ${nb(x + sens * 34)} 520L${nb(x - sens * 26)} 520L${nb(x - sens * 26)} 100Z`, rideau)
    o += trait(`M${nb(x + sens * 14)} 110Q${nb(x + sens * 40)} 300 ${nb(x + sens * 10)} 510`, pli, 5, op(0.6))
  }
  o += ornement(s, 330, 150, 0.7)
  // Étagère au-dessus du lit de droite.
  o += rect(1150, 300, 300, 10, s.c(s.p.bois))
  const lot = new Lot()
  let bx = 1170
  for (let i = 0; i < 9; i++) {
    const lb = s.a.entre(14, 24)
    const hb = s.a.entre(44, 70)
    lot.rect(bx, 300 - hb, lb - 2, hb, s.c(s.a.choix([s.p.tissu, s.p.accent, '#e5dbc2', assombrir(s.p.feuillage, 0.2)])))
    bx += lb
  }
  o += lot.rendu()
  o += plancher(s, ySol, s.p.sol, 420)
  // Tapis.
  o += ellipse(800, 770, 330, 62, s.c(assombrir(s.p.accent, 0.15))) + ellipse(800, 770, 286, 46, s.c(s.p.accent)) + trait(`M560 770a240 34 0 0 0 480 0a240 34 0 0 0 -480 0`, s.c(eclaircir(s.p.accent, 0.4)), 3, op(0.6))
  o += s.rayons.join('')
  o += lit(s, 60, 560, 440, s.p.tissu) + chevet(s, 524, 556)
  o += `<g transform="translate(${L} 0) scale(-1 1)">${lit(s, 60, 560, 440, ajuster(s.p.tissu, 150, -10, 0))}</g>`
  o += chevet(s, 980, 556)
  return o
}

function refectoire(s: Scene): string {
  const ySol = 548
  const vpy = 350
  let o = mur(s, ySol, 452) + tuyaux(s, 60)
  const baies: Baie[] = []
  for (const cx of [190, 495, 800, 1105, 1410]) baies.push({ x: cx - 76, y: 452, l: 152, h: 330 })
  o += fenetres(s, baies, 500, { y0: ySol, y1: H })
  o += banniere(s, 342, 96, 62, 230, s.p.tissu) + banniere(s, 1258, 96, 62, 230, s.p.accent)
  o += plancher(s, ySol, s.p.sol, vpy) + s.rayons.join('')
  // Table d'honneur au fond.
  o += rect(620, ySol - 34, 360, 14, s.c(eclaircir(s.p.bois, 0.2), 0.12)) + rect(636, ySol - 20, 328, 36, s.c(assombrir(s.p.bois, 0.15), 0.12))
  // Longues tables en perspective.
  const px = (xb: number, y: number): number => 800 + (xb - 800) * ((y - vpy) / (H - vpy))
  const table = (x1: number, x2: number, haut: number, dessus: string, flanc: string, yLoin: number, yPres: number): string => {
    const hl = haut * ((yLoin - vpy) / (H - vpy))
    const hp = haut * ((yPres - vpy) / (H - vpy))
    const interieur = Math.abs(x1 - 800) < Math.abs(x2 - 800) ? x1 : x2
    return chemin(pts(px(interieur, yPres), yPres - hp, px(interieur, yLoin), yLoin - hl, px(interieur, yLoin), yLoin, px(interieur, yPres), yPres), flanc)
      + chemin(pts(px(x1, yPres), yPres - hp, px(x2, yPres), yPres - hp, px(x2, yLoin), yLoin - hl, px(x1, yLoin), yLoin - hl), dessus)
  }
  const dessus = s.c(melanger(eclaircir(s.p.bois, 0.3), '#dcbc8e', 0.4))
  const flanc = s.c(assombrir(s.p.bois, 0.35))
  const banc = s.c(eclaircir(s.p.bois, 0.1))
  const allume = s.e.lampes > 0
  for (const cote of [-1, 1]) {
    const a = 800 + cote * 400
    const b = 800 + cote * 640
    o += table(800 + cote * 690, 800 + cote * 750, 46, banc, flanc, 590, 1010)
    o += table(a, b, 96, dessus, flanc, 590, 1010)
    o += table(800 + cote * 290, 800 + cote * 350, 46, banc, flanc, 590, 1010)
    // Couverts et chandelles.
    for (const y of [640, 700, 780]) {
      const k = (y - vpy) / (H - vpy)
      const cx = px((a + b) / 2, y)
      const cy = y - 96 * k
      o += ellipse(cx - 44 * k, cy + 6 * k, 30 * k, 8 * k, s.c('#f1eadc'))
      o += rect(cx + 20 * k, cy - 34 * k, 9 * k, 36 * k, s.c('#f1e7d0'))
      if (allume) {
        o += ellipse(cx + 24.5 * k, cy - 44 * k, 6 * k, 12 * k, '#fff3c2')
        halo(s, cx + 24.5 * k, cy - 44 * k, 150 * k, s.p.lampe, 0.7 * s.e.lampes)
      }
    }
  }
  o += lampe(s, 495, 70, 1.05) + lampe(s, 1105, 70, 1.05)
  return o
}

function couloir(s: Scene): string {
  const p = s.p
  const zf = 5.7
  const px = (z: number, f: number): number => 800 + (800 * f) / z
  const py = (z: number, g: number): number => 400 + g / z
  const prof = (z: number): number => ((z - 1) / (zf - 1)) * 0.5
  const xg = px(zf, -1)
  const xd = px(zf, 1)
  const yh = py(zf, -400)
  const yb = py(zf, 500)
  let o = ''
  // Fond du couloir.
  o += rect(xg, yh, xd - xg, yb - yh, s.c(assombrir(p.mur, 0.25), 0.5))
  const jour = s.lum !== 'nuit'
  const porte = arche(p.arc, 800 - 46, yb, 92, 118)
  o += chemin(porte, jour ? melanger(s.e.ciel[2], s.e.rayon, 0.6) : s.c(assombrir(p.bois, 0.3), 0.3))
  halo(s, 800, yb - 60, 190, s.e.rayon, jour ? 0.55 : 0)
  // Plafond, sol, murs.
  o += chemin(pts(0, 0, L, 0, xd, yh, xg, yh), s.t.lineaire(0, 0, 0, yh, [[0, s.c(assombrir(p.mur, 0.42))], [1, s.c(assombrir(p.mur, 0.3), 0.5)]]))
  o += chemin(pts(0, H, L, H, xd, yb, xg, yb), s.t.lineaire(0, yb, 0, H, [[0, s.c(p.sol, 0.5)], [1, s.c(assombrir(p.sol, 0.2))]]))
  o += chemin(pts(0, 0, xg, yh, xg, yb, 0, H), s.t.lineaire(0, 0, xg, 0, [[0, s.c(p.mur)], [1, s.c(assombrir(p.mur, 0.1), 0.5)]]))
  o += chemin(pts(L, 0, xd, yh, xd, yb, L, H), s.t.lineaire(L, 0, xd, 0, [[0, s.c(assombrir(p.mur, 0.12))], [1, s.c(assombrir(p.mur, 0.18), 0.5)]]))
  // Lambris en perspective.
  o += chemin(pts(0, py(1, 230), xg, py(zf, 230), xg, yb, 0, H), s.c(p.boiserie), op(0.9))
  o += chemin(pts(L, py(1, 230), xd, py(zf, 230), xd, yb, L, H), s.c(assombrir(p.boiserie, 0.1)), op(0.9))
  // Tapis.
  o += chemin(pts(px(1, -0.34), H, px(1, 0.34), H, px(zf, 0.34), yb, px(zf, -0.34), yb), s.t.lineaire(0, yb, 0, H, [[0, s.c(p.tissu, 0.45)], [1, s.c(p.tissu)]]))
  o += trait(ligne(px(1, -0.28), H, px(zf, -0.28), yb) + ligne(px(1, 0.28), H, px(zf, 0.28), yb), s.c(p.metal), 3, op(0.6))
  // Travées : fenêtres à gauche, portes à droite.
  const z = [1.12, 1.72, 2.5, 3.5, 4.8]
  const cadre = s.c(s.theme === 'moderne' ? '#f6f6f4' : assombrir(p.bois, 0.15))
  const k = s.e.forceRayon
  const vitre = s.t.lineaire(0, 100, 0, 600, [[0, s.e.ciel[1]], [1, s.e.ciel[3]]])
  let portails = ''
  for (let i = 0; i < z.length; i++) {
    const za = z[i]
    const zb = i + 1 < z.length ? z[i + 1] : zf
    const z1 = za + (zb - za) * 0.2
    const z2 = zb - (zb - za) * 0.16
    // Fenêtre.
    const f = pts(px(z1, -1), py(z1, -270), px(z2, -1), py(z2, -270), px(z2, -1), py(z2, 170), px(z1, -1), py(z1, 170))
    o += chemin(f, vitre)
    const zm = (z1 + z2) / 2
    o += trait(f + ligne(px(zm, -1), py(zm, -270), px(zm, -1), py(zm, 170)) + ligne(px(z1, -1), py(z1, -50), px(z2, -1), py(z2, -50)), cadre, Math.max(2, 9 / za))
    // Tache de lumière au sol.
    o += chemin(pts(px(z1 + 0.05, -0.92), py(z1 + 0.05, 500), px(z2 + 0.05, -0.92), py(z2 + 0.05, 500), px(z2 + 0.45, -0.1), py(z2 + 0.45, 500), px(z1 + 0.45, -0.1), py(z1 + 0.45, 500)), s.e.rayon, op(0.24 * k))
    // Porte.
    const d1 = za + (zb - za) * 0.3
    const d2 = zb - (zb - za) * 0.25
    o += chemin(pts(px(d1, 1), py(d1, -150), px(d2, 1), py(d2, -150), px(d2, 1), py(d2, 500), px(d1, 1), py(d1, 500)), s.c(assombrir(p.bois, 0.1), prof(za)))
    o += cercle(px(d1 + (d2 - d1) * 0.2, 1), py(d1 + (d2 - d1) * 0.2, 190), 7 / za, s.c(p.metal, prof(za)))
    // Applique.
    const ax = px(zb, 0.97)
    const ay = py(zb, -200)
    const allume = s.e.lampes > 0
    o += cercle(ax, ay, 16 / zb, allume ? '#ffe9b0' : s.c(eclaircir(p.metal, 0.2), prof(zb)))
    if (allume) halo(s, ax, ay, 260 / zb, p.lampe, 0.8 * s.e.lampes)
    // Portail (dessiné ensuite, du plus lointain au plus proche).
    const m = (s.theme === 'moderne' ? 30 : 64) / za
    const x0 = px(za, -1)
    const x1 = px(za, 1)
    const y0 = py(za, -400)
    const y1 = py(za, 500)
    const ext = `M${nb(x0)} ${nb(y0)}H${nb(x1)}V${nb(y1)}H${nb(x0)}Z`
    const ouverture = arche(p.arc, x0 + m, y1, x1 - x0 - 2 * m, y1 - y0 - m * (s.theme === 'moderne' ? 1 : 0.7))
    const teinte = s.c(assombrir(s.theme === 'moderne' ? p.pierre : p.pierre, i === 0 ? 0.42 : 0.14), prof(za))
    portails = chemin(ext + ouverture, teinte, PAIR)
      + rect(x0 + m - 6 / za, py(za, 190), 14 / za + 6 / za, 12 / za, s.c(eclaircir(p.pierre, 0.15), prof(za)), op(0.5))
      + rect(x1 - m - 14 / za, py(za, 190), 14 / za + 6 / za, 12 / za, s.c(eclaircir(p.pierre, 0.15), prof(za)), op(0.5))
      + portails
  }
  return o + portails
}

function bureau(s: Scene): string {
  const ySol = 628
  let o = mur(s, ySol, 500) + tuyaux(s, 52)
  o += fenetres(s, [{ x: 1130, y: 500, l: 290, h: 400 }], 520, { y0: ySol, y1: H })
  const rideau = s.c(s.p.tissu)
  o += rect(1080, 78, 390, 12, s.c(s.p.metal))
  for (const [x, sens] of [[1094, 1], [1456, -1]] as const) {
    o += chemin(`M${x} 86Q${nb(x + sens * 70)} 300 ${nb(x + sens * 26)} 530L${nb(x - sens * 30)} 530L${nb(x - sens * 30)} 86Z`, rideau)
    o += trait(`M${nb(x + sens * 10)} 96Q${nb(x + sens * 34)} 300 ${nb(x + sens * 4)} 520`, s.c(assombrir(s.p.tissu, 0.25)), 5, op(0.6))
  }
  o += rayonnage(s, s.a, 70, 80, 400, 548, 6)
  o += ornement(s, 640, 130, 0.9)
  // Pendule ou cadre secondaire.
  o += cercle(900, 190, 46, s.c(s.p.metal)) + cercle(900, 190, 37, s.c('#f3ecd9')) + trait(ligne(900, 190, 900, 162) + ligne(900, 190, 920, 198), s.c('#2b2a30'), 4)
  o += plancher(s, ySol, s.p.sol, 420) + s.rayons.join('')
  // Grand bureau, au premier plan.
  const haut = 668
  o += chemin(pts(250, haut, 1350, haut, 1420, haut + 54, 180, haut + 54), s.c(eclaircir(s.p.bois, 0.18)))
  o += rect(180, haut + 54, 1240, 14, s.c(assombrir(s.p.bois, 0.25)))
  o += rect(204, haut + 68, 1192, 240, s.c(assombrir(s.p.bois, 0.08)))
  let d = ''
  for (const x of [240, 560, 880, 1200]) d += pts(x, haut + 92, x + 160, haut + 92, x + 160, haut + 230, x, haut + 230)
  o += trait(d, s.c(assombrir(s.p.bois, 0.4)), 4, op(0.5))
  // Objets sur le bureau : lampe, livres, encrier, globe.
  const allume = s.e.lampes > 0
  const fer = s.c(assombrir(s.p.metal, 0.35))
  o += rect(352, haut - 76, 9, 80, fer) + ellipse(356, haut + 6, 34, 8, fer)
  o += chemin(pts(312, haut - 70, 400, haut - 70, 382, haut - 116, 330, haut - 116), allume ? melanger(s.p.accent, '#fff0c0', 0.6) : s.c(s.p.accent))
  if (allume) {
    halo(s, 356, haut - 66, 280, s.p.lampe, 0.85 * s.e.lampes)
    o += ellipse(356, haut + 22, 150, 20, s.p.lampe, op(0.2))
  }
  const lot = new Lot()
  lot.rect(470, haut - 18, 130, 22, s.c(s.p.tissu))
  lot.rect(480, haut - 36, 112, 18, s.c('#e5dbc2'))
  lot.rect(476, haut - 52, 104, 16, s.c(assombrir(s.p.feuillage, 0.2)))
  o += lot.rendu()
  o += chemin(pts(1006, haut + 12, 1130, haut + 6, 1150, haut + 34, 1020, haut + 40), s.c('#f6efdf')) + trait(ligne(1030, haut + 20, 1110, haut + 16) + ligne(1034, haut + 28, 1120, haut + 24), s.c('#6a6258'), 2, op(0.5))
  o += rect(1180, haut - 14, 30, 22, s.c('#23232b'), ' rx="4"') + trait(`M1196 ${haut - 12}Q1220 ${haut - 70} 1262 ${haut - 96}`, s.c('#f3ecd9'), 5)
  o += cercle(1296, haut - 44, 36, s.c(melanger(s.p.accent, '#7fb0c8', 0.5))) + chemin(`M1272 ${haut - 60}q14 -10 26 0t20 16q-14 10 -26 4t-20 -20Z`, s.c(s.p.feuillage), op(0.8))
  o += trait(`M1262 ${haut - 66}A40 40 0 0 0 1318 ${haut - 12}`, fer, 4) + rect(1290, haut - 8, 10, 14, fer) + ellipse(1295, haut + 8, 26, 6, fer)
  return o
}

function souterrain(s: Scene): string {
  const p = s.p
  // Sous terre, la lumière du dehors ne fait que filtrer : on assombrit toutes les surfaces.
  const roche = (c: string, pr = 0): string => s.c(assombrir(c, 0.38), pr)
  const ySol = 640
  let o = rect(0, 0, L, H, roche(assombrir(p.pierre, 0.25)))
  // Appareil de pierre.
  let d = ''
  for (let y = 40, rang = 0; y < ySol; y += 58, rang++) {
    d += `M0 ${y}H${L}`
    for (let x = rang % 2 ? 60 : 150; x < L; x += 180) d += `M${x} ${y}v58`
  }
  o += trait(d, roche(assombrir(p.pierre, 0.6)), 3, op(0.4))
  // Trois passages voûtés ; celui du centre s'enfonce au loin.
  const forme: FormeArc = p.arc === 'rect' ? 'rect' : p.arc
  const noir = roche(assombrir(p.pierre, 0.82))
  const passages: Baie[] = [{ x: 90, y: ySol, l: 300, h: 430 }, { x: 560, y: ySol, l: 480, h: 520 }, { x: 1210, y: ySol, l: 300, h: 430 }]
  for (const b of passages) {
    o += chemin(arche(forme, b.x - 34, b.y, b.l + 68, b.h + 34), roche(eclaircir(p.pierre, 0.1)))
    o += chemin(arche(forme, b.x, b.y, b.l, b.h), noir)
  }
  // Enfilade du passage central.
  const c = passages[1]
  for (let i = 1; i <= 3; i++) {
    const e = 1 - i * 0.24
    const l = c.l * e
    const h = c.h * e
    o += chemin(arche(forme, 800 - l / 2, ySol - (1 - e) * 40, l, h), roche(assombrir(p.pierre, 0.7 - i * 0.12), i * 0.1))
    o += chemin(arche(forme, 800 - l / 2 + 22 * e, ySol - (1 - e) * 40, l - 44 * e, h - 26 * e), roche(assombrir(p.pierre, 0.86 - i * 0.07)))
  }
  halo(s, 800, 520, 150, s.theme === 'fantasy' ? '#7fe0d8' : p.lampe, 0.45)
  // Sol dallé et flaque.
  o += rect(0, ySol, L, H - ySol, s.t.lineaire(0, ySol, 0, H, [[0, roche(p.pierre)], [1, roche(assombrir(p.pierre, 0.5))]]))
  o += trait(fuyantes(ySol, H, 800, 470, 170) + traverses(ySol, H, 470), roche(assombrir(p.pierre, 0.7)), 3, op(0.45))
  o += ellipse(1130, 790, 210, 30, s.e.ciel[2], op(0.16)) + ellipse(1160, 786, 120, 14, '#ffffff', op(0.06))
  // Rai de lumière tombant d'un soupirail.
  if (s.lum !== 'nuit') {
    const g = s.t.lineaire(330, 0, 520, 640, [[0, s.e.rayon, 0.42], [1, s.e.rayon, 0.02]])
    o += chemin(pts(250, 0, 370, 0, 640, 700, 380, 700), g) + ellipse(510, 700, 150, 22, s.e.rayon, op(0.16))
  }
  o += rect(240, 0, 140, 16, roche(assombrir(p.metal, 0.5)))
  // Torches, toujours allumées.
  for (const x of [475, 1125]) {
    o += rect(x - 5, 330, 10, 70, roche(assombrir(p.bois, 0.2))) + chemin(pts(x - 16, 332, x + 16, 332, x + 9, 352, x - 9, 352), roche(p.metal))
    if (s.theme === 'moderne') {
      o += rect(x - 7, 250, 14, 80, '#eaf4ff', ' rx="7"')
      halo(s, x, 290, 260, '#bcd8ff', 0.7)
    } else {
      o += chemin(`M${x - 13} 332Q${x - 18} 306 ${x} 276Q${x + 18} 306 ${x + 13} 332Z`, '#ffb24a') + chemin(`M${x - 6} 332Q${x - 8} 316 ${x} 300Q${x + 8} 316 ${x + 6} 332Z`, '#fff0b8')
      halo(s, x, 310, 300, '#ffb866', 0.8)
      halo(s, x, 310, 80, '#fff2cc', 0.6)
    }
  }
  // Détails propres au thème.
  if (s.theme === 'steampunk') {
    o += rect(0, 70, L, 22, roche(eclaircir(p.metal, 0.3))) + rect(0, 104, L, 10, roche(p.metal))
    for (const x of [140, 720, 1300]) o += chemin(engrenage(x, 81, 30, 8), roche(eclaircir(p.metal, 0.5)), PAIR)
  } else if (s.theme === 'fantasy' || s.theme === 'libre') {
    // Cristaux luisants.
    for (const [x, e] of [[70, 1.2], [1500, 1], [1420, 0.6]] as const) {
      o += chemin(pts(x - 26 * e, 700, x - 10 * e, 610, x + 6 * e, 700), '#6fd6cf', op(0.9)) + chemin(pts(x, 700, x + 22 * e, 640, x + 36 * e, 700), '#a5efe6', op(0.9))
      halo(s, x + 5 * e, 660, 150 * e, '#7fe0d8', 0.55)
    }
  } else if (s.theme === 'moderne') {
    for (let x = 0; x < L; x += 80) o += chemin(pts(x, 620, x + 40, 620, x + 20, ySol, x - 20, ySol), '#e5b53a', op(0.5))
  } else {
    // Niches à bougies.
    for (const x of [30, 1500]) {
      o += chemin(arche(forme, x, 470, 70, 110), noir) + rect(x + 30, 440, 10, 30, '#efe4c8')
      o += ellipse(x + 35, 432, 5, 10, '#ffe7a8')
      halo(s, x + 35, 432, 120, p.lampe, 0.7)
    }
  }
  // Stalactites et racines au plafond.
  const rs = creerAlea(deriver(s.graine, 'voute'))
  let st = ''
  for (let x = 20; x < L; x += rs.entre(50, 130)) {
    const h = rs.entre(18, 70)
    const l = rs.entre(10, 26)
    st += pts(x - l, 0, x + l, 0, x + rs.entre(-4, 4), h)
  }
  o += chemin(st, roche(assombrir(p.pierre, 0.6)))
  return o
}

// ───────────────────────── Scènes d'extérieur ─────────────────────────

function vitre(s: Scene, u: number, prof: number): string {
  if (u < s.e.vitres) return melanger('#ffd98a', '#ffab58', (u * 17) % 1)
  return s.c('#3a4862', prof * 0.6)
}

function maison(s: Scene, ra: Alea, x: number, yBas: number, l: number, h: number, prof: number, vitres: Lot, teinte: string): string {
  const p = s.p
  const yT = yBas - h
  let o = rect(x, yT, l, h + 4, s.c(teinte, prof))
  o += rect(x + l * 0.72, yT, l * 0.28, h + 4, s.c(assombrir(teinte, 0.18), prof), op(0.55))
  const ht = s.theme === 'moderne' ? 30 : l * ra.entre(0.34, 0.5)
  const toit = s.c(ra.chance(0.5) ? p.toit : ajuster(p.toit, ra.entre(-14, 14), 0, ra.entre(-5, 7)), prof)
  // Cheminée ou édicule, derrière le toit.
  const cx = x + l * ra.entre(0.18, 0.72)
  if (s.theme === 'moderne') o += rect(cx, yT - 34, l * 0.18, 30, s.c(assombrir(teinte, 0.25), prof)) + trait(ligne(cx + l * 0.3, yT - 6, cx + l * 0.3, yT - 60), s.c('#30343c', prof), 2)
  else if (s.theme !== 'orientale') o += rect(cx, yT - ht * 0.8, 15, ht * 0.7, s.c(assombrir(p.pierre, 0.3), prof)) + rect(cx - 3, yT - ht * 0.8 - 6, 21, 7, s.c(assombrir(p.pierre, 0.45), prof))
  o += chemin(toiture(s.theme, x, yT, l, ht), toit)
  if (s.theme === 'orientale') o += rect(x + l * 0.28, yT - ht - 5, l * 0.44, 7, s.c(assombrir(p.toit, 0.3), prof))
  // Fenêtres.
  const lf = 15
  const hf = s.theme === 'moderne' ? 18 : 24
  const col = Math.max(1, Math.floor((l - 16) / 34))
  const ran = Math.max(1, Math.floor((h - 14) / (s.theme === 'moderne' ? 36 : 52)))
  const ex = (l - col * lf) / (col + 1)
  const ey = (h - ran * hf) / (ran + 1)
  for (let r = 0; r < ran; r++) {
    for (let c = 0; c < col; c++) {
      vitres.rect(x + ex + c * (lf + ex), yT + ey * 0.8 + r * (hf + ey), lf, hf, vitre(s, ra.n(), prof))
    }
  }
  return o
}

/** Monument qui domine la ville, selon le thème. */
function monument(s: Scene, ra: Alea, x: number, yBas: number, h: number, prof: number): string {
  const p = s.p
  const pierre = s.c(p.pierre, prof)
  const sombre = s.c(assombrir(p.pierre, 0.22), prof)
  const toit = s.c(p.toit, prof)
  const yT = yBas - h
  let o = ''
  switch (s.theme) {
    case 'orientale': {
      // Pagode à étages.
      const n = 5
      for (let i = 0; i < n; i++) {
        const l = 150 - i * 20
        const y = yBas - (i * h) / (n + 0.6)
        const he = h / (n + 0.6)
        o += rect(x - l * 0.36, y - he, l * 0.72, he, s.c(i % 2 ? p.mur : p.boiserie, prof))
        o += chemin(toiture('orientale', x - l / 2, y - he * 0.62, l, he * 0.5), toit)
      }
      o += trait(ligne(x, yT + h * 0.1, x, yT - 46), s.c(p.metal, prof), 5)
      break
    }
    case 'gothique': {
      // Cathédrale à deux flèches.
      o += rect(x - 80, yBas - h * 0.55, 160, h * 0.55, pierre)
      o += chemin(pts(x - 80, yBas - h * 0.55, x, yBas - h * 0.78, x + 80, yBas - h * 0.55), toit)
      for (const dx of [-80, 80]) {
        o += rect(x + dx - 26, yBas - h * 0.7, 52, h * 0.7, sombre)
        o += chemin(pts(x + dx - 30, yBas - h * 0.7, x + dx, yT, x + dx + 30, yBas - h * 0.7), toit)
      }
      o += cercle(x, yBas - h * 0.4, 26, vitre(s, 0.1, prof)) + trait(disque(x, yBas - h * 0.4, 26), sombre, 5)
      o += chemin(arche('ogive', x - 22, yBas, 44, 76), s.c(assombrir(p.pierre, 0.6), prof))
      break
    }
    case 'moderne': {
      o += rect(x - 56, yT + 40, 112, h - 40, s.c('#8fa9c6', prof)) + rect(x + 16, yT + 40, 40, h - 40, s.c('#6f8cac', prof))
      o += rect(x - 38, yT, 76, 44, s.c('#7d98b8', prof)) + trait(ligne(x, yT, x, yT - 70), s.c('#3a4250', prof), 4)
      let d = ''
      for (let y = yT + 64; y < yBas; y += 26) d += `M${nb(x - 56)} ${nb(y)}h112`
      o += trait(d, s.c('#dfeaf5', prof), 2, op(0.5))
      if (s.e.lampes > 0) o += cercle(x, yT - 70, 5, '#ff5a4a')
      break
    }
    case 'steampunk': {
      // Tour d'horloge et cheminées.
      o += rect(x - 46, yT + 50, 92, h - 50, pierre) + rect(x + 14, yT + 50, 32, h - 50, sombre, op(0.6))
      o += chemin(toiture('steampunk', x - 54, yT + 50, 108, 56), toit) + rect(x - 5, yT - 50, 10, 50, s.c(p.metal, prof))
      o += cercle(x, yT + 110, 34, s.e.lampes > 0 ? '#ffe9b0' : s.c('#efe4c8', prof)) + trait(disque(x, yT + 110, 34), s.c(assombrir(p.metal, 0.3), prof), 6)
      o += trait(ligne(x, yT + 110, x, yT + 86) + ligne(x, yT + 110, x + 16, yT + 118), s.c('#2b2a30', prof), 4)
      for (const dx of [-110, 96]) {
        o += chemin(pts(x + dx - 16, yBas, x + dx - 11, yBas - h * 0.6, x + dx + 11, yBas - h * 0.6, x + dx + 16, yBas), sombre)
        o += rect(x + dx - 15, yBas - h * 0.6 - 8, 30, 10, s.c(p.metal, prof))
      }
      break
    }
    default: {
      // Donjon à toit conique.
      o += rect(x - 50, yT + 96, 100, h - 96, pierre) + rect(x + 14, yT + 96, 36, h - 96, sombre, op(0.6))
      o += rect(x - 60, yT + 84, 120, 20, sombre)
      o += chemin(pts(x - 64, yT + 86, x, yT - 20, x + 64, yT + 86), toit)
      o += trait(ligne(x, yT - 20, x, yT - 70), s.c('#3a3440', prof), 3) + chemin(pts(x, yT - 70, x + 38, yT - 58, x, yT - 46), s.c(p.tissu, prof))
      const lot = new Lot()
      for (let i = 0; i < 3; i++) lot.rect(x - 9, yT + 140 + i * 70, 18, 34, vitre(s, ra.n(), prof))
      o += lot.rendu(' rx="8"')
    }
  }
  if (s.e.lampes > 0 && s.theme === 'steampunk') halo(s, x, yT + 110, 120, p.lampe, 0.5)
  return o
}

function fumee(s: Scene, x: number, y: number, e: number): string {
  const c = s.lum === 'nuit' ? '#6c7699' : s.lum === 'crepuscule' ? '#f0c4b0' : '#ffffff'
  return `<g${op(0.5)}>${cercle(x, y, 14 * e, c)}${cercle(x + 16 * e, y - 22 * e, 20 * e, c)}${cercle(x + 44 * e, y - 44 * e, 27 * e, c)}${cercle(x + 84 * e, y - 62 * e, 34 * e, c)}</g>`
}

function ville(s: Scene): string {
  const p = s.p
  const horizon = 570
  let o = ciel(s, horizon)
  // Silhouette lointaine.
  const rl = creerAlea(deriver(s.graine, 'lointain'))
  let d = `M-20 ${horizon + 40}`
  for (let x = -20; x < L + 20; ) {
    const l = rl.entre(44, 110)
    const h = rl.entre(50, 150)
    if (s.theme === 'gothique' && rl.chance(0.3)) d += `L${nb(x)} ${nb(horizon - h)}L${nb(x + l / 2)} ${nb(horizon - h - l * 1.3)}L${nb(x + l)} ${nb(horizon - h)}`
    else if (s.theme === 'moderne') d += `L${nb(x)} ${nb(horizon - h * 1.5)}L${nb(x + l)} ${nb(horizon - h * 1.5)}`
    else d += `L${nb(x)} ${nb(horizon - h)}L${nb(x + l * 0.5)} ${nb(horizon - h - l * 0.36)}L${nb(x + l)} ${nb(horizon - h)}`
    x += l
  }
  o += chemin(d + `L${L + 20} ${horizon + 40}Z`, s.c(p.pierre, 0.78))
  // Monument du côté opposé à l'astre.
  const mx = s.sens < 0 ? 1190 : 410
  o += monument(s, s.a, mx, horizon + 20, 470, 0.42)
  if (s.theme === 'steampunk') o += fumee(s, mx - 110, horizon + 20 - 296, 1) + fumee(s, mx + 96, horizon + 20 - 296, 0.8)
  // Deux rangs de maisons.
  const murs = [p.mur, eclaircir(p.mur, 0.12), assombrir(p.mur, 0.1), ajuster(p.mur, 12, 6, -4), ajuster(p.mur, -14, 4, 2)]
  for (const [yBas, hMin, hMax, prof] of [[620, 130, 230, 0.26], [700, 110, 170, 0.06]] as const) {
    const lot = new Lot()
    let rang = ''
    for (let x = -40; x < L + 20; ) {
      const l = s.a.entre(120, 200)
      const h = s.a.entre(hMin, hMax)
      rang += maison(s, s.a, x, yBas, l, h, prof, lot, s.a.choix(murs))
      x += l + s.a.entre(-6, 8)
    }
    o += rang + lot.rendu()
  }
  // Rue pavée.
  o += rect(0, 696, L, 204, s.t.lineaire(0, 696, 0, H, [[0, s.c(assombrir(p.pierre, 0.25))], [1, s.c(assombrir(p.pierre, 0.55))]]))
  o += trait(fuyantes(696, H, 800, 560, 130) + traverses(696, H, 560), s.c(assombrir(p.pierre, 0.7)), 2, op(0.35))
  o += lampadaire(s, 330, 760, 250) + lampadaire(s, 1270, 760, 250)
  // Façades proches, qui encadrent la rue.
  const proche = s.c(assombrir(p.mur, 0.5))
  o += rect(-10, 60, 150, 840, proche) + rect(L - 150, 130, 160, 770, proche)
  o += rect(-10, 60, 168, 18, s.c(assombrir(p.toit, 0.4))) + rect(L - 168, 130, 178, 18, s.c(assombrir(p.toit, 0.4)))
  const lot = new Lot()
  for (let i = 0; i < 4; i++) {
    lot.rect(36, 130 + i * 130, 60, 76, vitre(s, s.a.n(), 0))
    lot.rect(L - 104, 210 + i * 130, 60, 76, vitre(s, s.a.n(), 0))
  }
  o += lot.rendu()
  // Enseigne.
  o += trait(ligne(140, 470, 216, 470), s.c('#22222a'), 5) + rect(160, 476, 50, 62, s.c(p.tissu), ' rx="6"') + cercle(185, 506, 13, s.c(p.metal))
  return o
}

function cour(s: Scene): string {
  const p = s.p
  const ySol = 612
  let o = ciel(s, ySol)
  const rl = creerAlea(deriver(s.graine, 'lointain'))
  o += chemin(crete(rl, ySol - 60, 190, 70, true, ySol + 20), s.c(p.feuillage, 0.7))
  o += chemin(crete(rl, ySol - 10, 120, 44, true, ySol + 20), s.c(assombrir(p.feuillage, 0.2), 0.42))
  // Bâtiment du fond, avec sa galerie d'arcades.
  const x0 = 120
  const larg = 1360
  const yToit = 250
  const murC = s.c(p.mur, 0.1)
  o += rect(x0, yToit, larg, ySol - yToit, murC)
  o += chemin(toiture(s.theme === 'gothique' ? 'libre' : s.theme, x0, yToit, larg, s.theme === 'moderne' ? 60 : 96), s.c(p.toit, 0.1))
  if (s.theme === 'gothique') {
    for (let x = x0 + 20; x < x0 + larg; x += 170) o += chemin(pts(x - 13, yToit - 6, x, yToit - 80, x + 13, yToit - 6), s.c(assombrir(p.toit, 0.2), 0.1))
  } else if (s.theme === 'steampunk') {
    for (const x of [300, 760, 1240]) o += rect(x, yToit - 150, 30, 150, s.c(assombrir(p.pierre, 0.3), 0.1)) + rect(x - 5, yToit - 158, 40, 10, s.c(p.metal, 0.1)) + fumee(s, x + 14, yToit - 174, 0.7)
  } else if (s.theme === 'fantasy' || s.theme === 'libre') {
    for (const x of [420, 800, 1180]) o += chemin(pts(x - 30, yToit - 30, x, yToit - 74, x + 30, yToit - 30), s.c(assombrir(p.toit, 0.15), 0.1)) + rect(x - 11, yToit - 46, 22, 26, vitre(s, s.a.n(), 0.1))
  }
  o += rect(x0, yToit, larg, 12, s.c(eclaircir(p.mur, 0.25), 0.1)) + rect(x0, 398, larg, 12, s.c(eclaircir(p.mur, 0.2), 0.1))
  const n = 7
  const trav = larg / n
  const lot = new Lot()
  const ombre = s.c(assombrir(p.mur, 0.62), 0.06)
  let arcs = ''
  for (let i = 0; i < n; i++) {
    const cx = x0 + trav * (i + 0.5)
    // Fenêtres de l'étage.
    arcs += chemin(arche(p.arc, cx - 26, 372, 52, 86), vitre(s, s.a.n(), 0.1)) + rect(cx - 32, 372, 64, 7, s.c(eclaircir(p.mur, 0.25), 0.1))
    // Arcade.
    arcs += chemin(arche(p.arc, cx - 68, ySol, 136, 186), ombre)
    arcs += chemin(arche(p.arc, cx - 30, ySol, 60, 110), s.c(assombrir(p.bois, 0.45), 0.06))
    if (s.e.lampes > 0) {
      arcs += cercle(cx, ySol - 150, 7, '#ffe9b0')
      halo(s, cx, ySol - 150, 110, p.lampe, 0.6 * s.e.lampes)
    }
    lot.rect(cx - trav / 2 - 12, ySol - 126, 24, 9, s.c(eclaircir(p.mur, 0.25), 0.1))
  }
  o += arcs + lot.rendu()
  // Sol pavé.
  o += rect(0, ySol, L, H - ySol, s.t.lineaire(0, ySol, 0, H, [[0, s.c(eclaircir(p.pierre, 0.12))], [1, s.c(assombrir(p.pierre, 0.35))]]))
  o += trait(fuyantes(ySol, H, 800, 430, 150) + traverses(ySol, H, 430), s.c(assombrir(p.pierre, 0.5)), 2, op(0.3))
  // Fontaine.
  const fx = 380
  const eau = melanger(s.e.ciel[2], '#ffffff', 0.15)
  o += ellipse(fx, 716, 176, 36, s.c(assombrir(p.pierre, 0.3))) + rect(fx - 176, 680, 352, 36, s.c(assombrir(p.pierre, 0.12)))
  o += ellipse(fx, 680, 176, 34, s.c(eclaircir(p.pierre, 0.15))) + ellipse(fx, 680, 152, 26, eau)
  o += rect(fx - 13, 560, 26, 122, s.c(p.pierre)) + ellipse(fx, 562, 62, 13, s.c(eclaircir(p.pierre, 0.2))) + ellipse(fx, 560, 50, 8, eau)
  o += trait(`M${fx} 520Q${fx - 34} 520 ${fx - 44} 558M${fx} 520Q${fx + 34} 520 ${fx + 44} 558M${fx} 520V556`, '#ffffff', 4, op(0.7))
  o += trait(`M${fx - 56} 574Q${fx - 84} 620 ${fx - 92} 672M${fx + 56} 574Q${fx + 84} 620 ${fx + 92} 672`, '#ffffff', 3, op(0.45))
  // Arbre.
  o += arbre(s, s.a, 1250, 680, 500, 0, essenceTheme(s.theme))
  return o
}

/** Petite fabrique de jardin, selon le thème. */
function fabrique(s: Scene, x: number, y: number, e: number): string {
  const p = s.p
  let o = ''
  if (s.theme === 'orientale') {
    o += rect(x - 120 * e, y - 16 * e, 240 * e, 16 * e, s.c(p.pierre))
    for (const dx of [-96, -36, 36, 96]) o += rect(x + dx * e - 6 * e, y - 180 * e, 12 * e, 166 * e, s.c(p.bois))
    o += rect(x - 104 * e, y - 62 * e, 208 * e, 8 * e, s.c(p.bois))
    o += chemin(toiture('orientale', x - 120 * e, y - 172 * e, 240 * e, 92 * e), s.c(p.toit)) + cercle(x, y - 270 * e, 8 * e, s.c(p.metal))
  } else if (s.theme === 'gothique') {
    o += chemin(arche('ogive', x - 96 * e, y, 192 * e, 290 * e) + arche('ogive', x - 66 * e, y, 132 * e, 244 * e), s.c(p.pierre), PAIR)
    o += rect(x - 104 * e, y - 16 * e, 46 * e, 16 * e, s.c(assombrir(p.pierre, 0.2))) + rect(x + 58 * e, y - 16 * e, 46 * e, 16 * e, s.c(assombrir(p.pierre, 0.2)))
    o += chemin(touffes(creerAlea(deriver(s.graine, 'lierre')), x - 100 * e, x - 54 * e, y - 150 * e, 60 * e, 9), s.c(p.feuillage))
  } else if (s.theme === 'steampunk' || s.theme === 'moderne') {
    // Serre vitrée.
    const d = arche('plein', x - 120 * e, y, 240 * e, 230 * e)
    o += chemin(d, melanger(s.e.ciel[2], '#ffffff', 0.3), op(0.5))
    let r = ''
    for (const dx of [-60, 0, 60]) r += `M${nb(x + dx * e)} ${nb(y)}V${nb(y - (dx === 0 ? 230 : 214) * e)}`
    r += `M${nb(x - 120 * e)} ${nb(y - 110 * e)}H${nb(x + 120 * e)}M${nb(x - 120 * e)} ${nb(y - 56 * e)}H${nb(x + 120 * e)}`
    o += trait(r, s.c(assombrir(p.metal, 0.3)), 4 * e) + trait(d, s.c(assombrir(p.metal, 0.3)), 7 * e)
    if (s.e.lampes > 0) halo(s, x, y - 100 * e, 200 * e, p.lampe, 0.5 * s.e.lampes)
  } else {
    // Kiosque rond.
    o += rect(x - 110 * e, y - 16 * e, 220 * e, 16 * e, s.c(p.pierre))
    for (const dx of [-92, -32, 32, 92]) o += rect(x + dx * e - 7 * e, y - 170 * e, 14 * e, 156 * e, s.c(eclaircir(p.pierre, 0.25)))
    o += rect(x - 104 * e, y - 180 * e, 208 * e, 14 * e, s.c(eclaircir(p.pierre, 0.15)))
    o += chemin(`M${nb(x - 120 * e)} ${nb(y - 178 * e)}Q${nb(x - 40 * e)} ${nb(y - 210 * e)} ${nb(x)} ${nb(y - 290 * e)}Q${nb(x + 40 * e)} ${nb(y - 210 * e)} ${nb(x + 120 * e)} ${nb(y - 178 * e)}Z`, s.c(p.toit))
    o += cercle(x, y - 294 * e, 8 * e, s.c(p.metal))
  }
  return o
}

function jardin(s: Scene): string {
  const p = s.p
  const horizon = 520
  const herbe = ajuster(p.feuillage, -18, 8, 14)
  let o = ciel(s, horizon)
  const rl = creerAlea(deriver(s.graine, 'lointain'))
  o += chemin(crete(rl, horizon - 10, 170, 80, true, horizon + 30), s.c(p.feuillage, 0.72))
  o += chemin(crete(rl, horizon + 16, 130, 36, true, horizon + 40), s.c(assombrir(p.feuillage, 0.2), 0.4))
  // Arbres du fond.
  for (const x of [520, 700, 960, 1480]) o += arbre(s, s.a, x + s.a.entre(-30, 30), horizon + 30, s.a.entre(170, 250), 0.3, s.a.chance(0.4) ? 'conifere' : essenceTheme(s.theme) === 'nu' ? 'feuillu' : essenceTheme(s.theme))
  // Pelouse.
  o += rect(0, horizon + 20, L, H - horizon, s.t.lineaire(0, horizon, 0, H, [[0, s.c(eclaircir(herbe, 0.1), 0.12)], [1, s.c(assombrir(herbe, 0.4))]]))
  // Haies taillées.
  const haie = s.c(assombrir(p.feuillage, 0.25), 0.08)
  o += rect(-30, 556, 600, 62, haie, ' rx="26"') + rect(1030, 556, 600, 62, haie, ' rx="26"')
  o += rect(-30, 556, 600, 20, s.c(p.feuillage, 0.08), ' rx="10"') + rect(1030, 556, 600, 20, s.c(p.feuillage, 0.08), ' rx="10"')
  // Allée sinueuse.
  o += chemin('M600 900C690 770 900 700 790 548L826 548C980 690 900 790 1000 900Z', s.c('#dccfb4'))
  o += chemin('M600 900C690 770 900 700 790 548L800 548C900 700 720 780 660 900Z', s.c('#efe5cf'), op(0.5))
  o += fabrique(s, 1270, 640, 1)
  // Massifs de fleurs.
  const rf = creerAlea(deriver(s.graine, 'fleurs'))
  const teintes = [p.accent, p.tissu, '#ffffff', '#ffd75e', '#f29cc2'].map((c) => s.c(c))
  const feuilles = new Lot()
  const fleurs = new Lot()
  for (const [mx, my, rx, ry] of [[330, 780, 250, 70], [1250, 800, 260, 64], [960, 640, 90, 24], [640, 650, 80, 22]] as const) {
    feuilles.ajouter(s.c(assombrir(p.feuillage, 0.15)), `M${nb(mx - rx)} ${nb(my)}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`)
    const n = Math.round(rx / 5)
    for (let i = 0; i < n; i++) {
      const ang = rf.entre(0, 6.28)
      const d = Math.sqrt(rf.n())
      fleurs.disque(mx + Math.cos(ang) * rx * d * 0.92, my + Math.sin(ang) * ry * d * 0.8 - ry * 0.25, rf.entre(4, 8.5) * (ry / 60 + 0.3), rf.choix(teintes))
    }
  }
  o += feuilles.rendu() + fleurs.rendu()
  o += lampadaire(s, 560, 716, 170) + lampadaire(s, 1040, 716, 170)
  // Grand arbre au premier plan.
  o += arbre(s, s.a, 170, 760, 760, 0, essenceTheme(s.theme) === 'nu' ? 'feuillu' : essenceTheme(s.theme))
  if (s.lum === 'nuit') {
    const rz = creerAlea(deriver(s.graine, 'lucioles'))
    for (let i = 0; i < 16; i++) halo(s, rz.entre(260, 1500), rz.entre(430, 760), rz.entre(10, 22), '#eaffb0', 0.9)
  }
  return o
}

function arene(s: Scene): string {
  const p = s.p
  const sable = '#dcbd8c'
  let o = ciel(s, 420)
  // Courbe en cuvette : y aux bords, y au centre.
  const courbe = (yBord: number, yCentre: number): string => `M-20 ${nb(yBord)}Q800 ${nb(2 * yCentre - yBord)} ${L + 20} ${nb(yBord)}`
  const retour = (yBord: number, yCentre: number): string => `L${L + 20} ${nb(yBord)}Q800 ${nb(2 * yCentre - yBord)} -20 ${nb(yBord)}Z`
  const yEn = (x: number, yBord: number, yCentre: number): number => {
    const t = (x + 20) / (L + 40)
    return (1 - t) * (1 - t) * yBord + 2 * t * (1 - t) * (2 * yCentre - yBord) + t * t * yBord
  }
  // Piste.
  o += rect(0, 500, L, 400, s.t.lineaire(0, 540, 0, H, [[0, s.c(eclaircir(sable, 0.1))], [1, s.c(assombrir(sable, 0.4))]]))
  o += trait('M240 760a560 96 0 0 0 1120 0a560 96 0 0 0 -1120 0', s.c(eclaircir(sable, 0.35)), 5, op(0.35))
  o += trait('M520 770a280 44 0 0 0 560 0a280 44 0 0 0 -560 0', s.c(assombrir(sable, 0.3)), 3, op(0.25))
  // Galerie haute à colonnes.
  const [hb, hc] = [96, 262]
  o += chemin(courbe(hb, hc) + retour(hb + 70, hc + 52), s.c(assombrir(p.pierre, 0.5), 0.3))
  o += `<path d="${courbe(hb + 34, hc + 26)}" fill="none" stroke="${s.c(eclaircir(p.pierre, 0.1), 0.3)}" stroke-width="56" stroke-dasharray="13 37"/>`
  o += `<path d="${courbe(hb - 4, hc - 4)}" fill="none" stroke="${s.c(p.toit, 0.3)}" stroke-width="16"/>`
  // Gradins.
  const rangs = 6
  const rc = creerAlea(deriver(s.graine, 'foule'))
  const foule = [p.tissu, p.accent, '#f1e6d0', '#39405a', p.metal, ajuster(p.tissu, 150, -10, 6)]
  for (let i = 0; i < rangs; i++) {
    const t0 = i / rangs
    const t1 = (i + 1) / rangs
    const b0 = hb + 70 + (480 - hb - 70) * t0
    const c0 = hc + 52 + (440 - hc - 52) * t0
    const b1 = hb + 70 + (480 - hb - 70) * t1
    const c1 = hc + 52 + (440 - hc - 52) * t1
    const pr = 0.26 - i * 0.03
    o += chemin(courbe(b0, c0) + retour(b1, c1), s.c(i % 2 ? p.pierre : eclaircir(p.pierre, 0.12), pr))
    for (let j = 0; j < 2; j++) {
      o += `<path d="${courbe((b0 + b1) / 2 - 3, (c0 + c1) / 2 - 3)}" fill="none" stroke="${s.c(rc.choix(foule), pr)}" stroke-width="${nb(7 + i)}" stroke-linecap="round" stroke-dasharray="0.1 ${nb(rc.entre(16, 30))} 0.1 ${nb(rc.entre(30, 70))}" stroke-dashoffset="${nb(rc.entre(0, 60))}"${op(0.75)}/>`
    }
  }
  // Mur de piste et portes.
  o += chemin(courbe(480, 440) + retour(640, 556), s.t.lineaire(0, 440, 0, 640, [[0, s.c(eclaircir(p.pierre, 0.05), 0.08)], [1, s.c(assombrir(p.pierre, 0.3), 0.04)]]))
  o += `<path d="${courbe(482, 442)}" fill="none" stroke="${s.c(eclaircir(p.pierre, 0.3), 0.08)}" stroke-width="10"/>`
  for (const x of [400, 1200]) {
    const yb = yEn(x, 640, 556)
    o += chemin(arche(p.arc, x - 56, yb + 2, 112, 104), s.c(assombrir(p.pierre, 0.75)))
    o += trait(fuyantesGrille(x - 46, yb - 86, 92, 86), s.c(assombrir(p.metal, 0.5)), 3, op(0.8))
  }
  // Tentures sur le mur.
  for (const x of [130, 620, 800, 980, 1470]) {
    const yh = yEn(x, 480, 440) + 10
    o += chemin(pts(x - 26, yh, x + 26, yh, x + 26, yh + 74, x, yh + 56, x - 26, yh + 74), s.c(x === 800 ? p.accent : p.tissu, 0.05))
    o += rect(x - 6, yh, 12, 56, s.c(p.metal, 0.05), op(0.8))
  }
  // Mâts et oriflammes.
  for (const x of [90, 330, 570, 1030, 1270, 1510]) {
    const yh = yEn(x, hb, hc)
    o += trait(ligne(x, yh, x, yh - 96), s.c('#3a3440', 0.3), 4)
    o += chemin(`M${x} ${nb(yh - 96)}Q${x + 34} ${nb(yh - 100)} ${x + 62} ${nb(yh - 82)}Q${x + 30} ${nb(yh - 80)} ${x} ${nb(yh - 62)}Z`, s.c(x % 480 === 90 ? p.accent : p.tissu, 0.2))
  }
  // Braseros.
  const allume = s.e.lampes > 0
  for (const x of [250, 1350]) {
    const yh = yEn(x, 480, 440)
    o += rect(x - 6, yh - 40, 12, 44, s.c(assombrir(p.metal, 0.5))) + chemin(pts(x - 26, yh - 58, x + 26, yh - 58, x + 15, yh - 36, x - 15, yh - 36), s.c(assombrir(p.metal, 0.4)))
    if (allume) {
      o += chemin(`M${x - 18} ${nb(yh - 58)}Q${x - 24} ${nb(yh - 90)} ${x} ${nb(yh - 124)}Q${x + 24} ${nb(yh - 90)} ${x + 18} ${nb(yh - 58)}Z`, '#ffb24a') + chemin(`M${x - 8} ${nb(yh - 58)}Q${x - 10} ${nb(yh - 78)} ${x} ${nb(yh - 96)}Q${x + 10} ${nb(yh - 78)} ${x + 8} ${nb(yh - 58)}Z`, '#fff0b8')
      halo(s, x, yh - 86, 330, '#ffb866', 0.75 * s.e.lampes)
    }
  }
  return o
}

/** Herse d'une porte d'arène. */
function fuyantesGrille(x: number, y: number, l: number, h: number): string {
  let d = ''
  for (let i = 1; i < 5; i++) d += `M${nb(x + (l * i) / 5)} ${nb(y)}v${nb(h)}`
  d += `M${nb(x)} ${nb(y + h * 0.35)}h${nb(l)}M${nb(x)} ${nb(y + h * 0.7)}h${nb(l)}`
  return d
}

function foret(s: Scene): string {
  const p = s.p
  const [c0, c1, c2, c3] = s.e.ciel
  const feuille = s.theme === 'steampunk' ? '#b5742c' : s.theme === 'fantasy' ? '#3f8f7a' : p.feuillage
  const ecorce = s.theme === 'moderne' ? '#e9e6dc' : s.theme === 'orientale' ? '#6f9a4e' : assombrir(p.bois, 0.15)
  // Clarté diffuse entre les arbres.
  const fond = melanger(s.c(eclaircir(feuille, 0.5)), c3, 0.55)
  let o = rect(0, 0, L, H, s.t.lineaire(0, 0, 0, 700, [[0, melanger(c1, s.c(feuille), 0.5)], [0.6, fond], [1, s.c(feuille, 0.5)]]))
  o += cercle(800, 330, 520, s.t.halo(s.lum === 'nuit' ? '#8fa5e8' : melanger(c3, '#ffffff', 0.5)), op(s.lum === 'nuit' ? 0.4 : 0.8))
  if (s.e.etoiles > 0 && c0) {
    const re = creerAlea(deriver(s.graine, 'etoiles'))
    let e = ''
    for (let i = 0; i < 40; i++) e += disque(re.entre(300, 1300), re.entre(120, 430), re.entre(0.8, 1.9))
    o += chemin(e, '#ffffff', op(0.5 * s.e.etoiles))
  }
  // Quatre plans de troncs, du plus lointain au plus proche.
  const plans = [
    { n: 15, sol: 560, l: 16, prof: 0.74, centre: true },
    { n: 11, sol: 600, l: 30, prof: 0.5, centre: true },
    { n: 7, sol: 650, l: 56, prof: 0.26, centre: false },
    { n: 4, sol: 730, l: 110, prof: 0, centre: false },
  ]
  for (const [i, plan] of plans.entries()) {
    const teinte = s.c(i === 3 ? assombrir(ecorce, 0.45) : ecorce, plan.prof)
    const ombre = s.c(assombrir(ecorce, i === 3 ? 0.6 : 0.3), plan.prof)
    // Sol du plan.
    o += chemin(crete(s.a, plan.sol + 24, 40, 120, true), s.c(assombrir(feuille, 0.15 + i * 0.12), plan.prof))
    let troncs = ''
    for (let k = 0; k < plan.n; k++) {
      let x = ((k + s.a.entre(0.15, 0.85)) / plan.n) * L
      // Les plans proches laissent le centre libre.
      if (!plan.centre && x > 420 && x < 1180) x = x < 800 ? x - 400 * s.a.entre(0.7, 1) : x + 400 * s.a.entre(0.7, 1)
      const l = plan.l * s.a.entre(0.7, 1.25)
      const penche = s.a.entre(-40, 40) * (plan.l / 60)
      const ys = plan.sol + s.a.entre(0, 26)
      troncs += chemin(`M${nb(x + penche - l * 0.38)} -10L${nb(x + penche + l * 0.38)} -10L${nb(x + l * 0.5)} ${nb(ys - l)}Q${nb(x + l * 0.6)} ${nb(ys - l * 0.2)} ${nb(x + l * 1.2)} ${nb(ys + 6)}L${nb(x - l * 1.2)} ${nb(ys + 6)}Q${nb(x - l * 0.6)} ${nb(ys - l * 0.2)} ${nb(x - l * 0.5)} ${nb(ys - l)}Z`, teinte)
      troncs += chemin(`M${nb(x + penche + l * 0.1)} -10L${nb(x + penche + l * 0.38)} -10L${nb(x + l * 0.5)} ${nb(ys - l)}L${nb(x + l * 0.16)} ${nb(ys - l)}Z`, ombre, op(0.55))
      if (s.theme === 'orientale' || s.theme === 'moderne') {
        // Nœuds de bambou ou marques de bouleau.
        let d = ''
        for (let y = 30 + s.a.entre(0, 60); y < ys - l; y += plan.l * s.a.entre(1.6, 3)) d += `M${nb(x + penche * (1 - y / ys) - l * 0.4)} ${nb(y)}h${nb(l * (s.theme === 'moderne' ? 0.4 : 0.8))}`
        troncs += trait(d, s.c(s.theme === 'moderne' ? '#2e2c2a' : assombrir(ecorce, 0.4), plan.prof), Math.max(1.5, l * 0.07), op(0.7))
      }
    }
    o += troncs
    if (i === 1) {
      // Rais de lumière entre les plans.
      const k = s.e.forceRayon
      for (const [x, l] of [[520, 120], [760, 190], [1040, 110]] as const) {
        const g = s.t.lineaire(x, 0, x - s.sens * 180, 640, [[0, s.e.rayon, 0.34 * k], [1, s.e.rayon, 0]])
        o += chemin(pts(x, -10, x + l, -10, x + l * 1.6 - s.sens * 240, 680, x - l * 0.4 - s.sens * 240, 680), g)
      }
    }
  }
  // Sentier.
  o += chemin('M560 900C700 800 770 720 780 610L822 610C840 720 900 800 1050 900Z', s.t.lineaire(0, 610, 0, H, [[0, s.c(melanger('#d8c49a', feuille, 0.3), 0.4)], [1, s.c(melanger('#c9b58c', feuille, 0.35))]]))
  // Fougères et talus du premier plan, sur les côtés.
  const rh = creerAlea(deriver(s.graine, 'herbes'))
  o += ellipse(120, 900, 560, 130, s.c(assombrir(feuille, 0.6))) + ellipse(1480, 900, 560, 130, s.c(assombrir(feuille, 0.6)))
  o += chemin(touffes(rh, -10, 600, 800, 120, 15) + touffes(rh, 1000, L + 10, 800, 120, 15), s.c(assombrir(feuille, 0.6)))
  // Frondaisons en surplomb.
  let f1 = ''
  let f2 = ''
  for (let x = -40; x < L + 60; x += rh.entre(70, 130)) {
    const r = rh.entre(60, 120)
    const y = rh.entre(-40, 30) + (Math.abs(x - 800) < 420 ? -50 : 20)
    f1 += disque(x, y, r)
    f2 += disque(x + 20, y - 26, r * 0.74)
  }
  o += chemin(f1, s.c(assombrir(feuille, 0.5))) + chemin(f2, s.c(assombrir(feuille, 0.32)), op(0.9))
  // Lucioles ou esprits lumineux.
  if (s.lum !== 'jour' || s.theme === 'fantasy') {
    const rz = creerAlea(deriver(s.graine, 'lucioles'))
    const teinte = s.theme === 'fantasy' ? '#9ff0e2' : '#eaffb0'
    for (let i = 0; i < 18; i++) halo(s, rz.entre(120, 1480), rz.entre(300, 760), rz.entre(9, 24), teinte, s.lum === 'jour' ? 0.6 : 0.95)
  }
  return o
}

function tour(s: Scene): string {
  const p = s.p
  const horizon = 600
  let o = ciel(s, horizon)
  const rl = creerAlea(deriver(s.graine, 'lointain'))
  o += chemin(crete(rl, horizon - 30, 300, 70, false, horizon + 40), s.c(ajuster(p.pierre, 200, 6, 0), 0.8))
  o += chemin(crete(rl, horizon, 210, 60, false, horizon + 40), s.c(ajuster(p.pierre, 200, 4, -8), 0.6))
  o += chemin(crete(rl, horizon + 30, 130, 50, true, horizon + 60), s.c(p.feuillage, 0.5))
  // La tour se dresse du côté opposé à l'astre.
  const x = s.sens < 0 ? 1170 : 430
  const yB = 660
  const yT = 190
  const lb = 96
  const lh = 76
  const pierre = s.c(p.pierre, 0.06)
  const ombre = s.c(assombrir(p.pierre, 0.28), 0.06)
  o += rect(0, horizon + 20, L, H - horizon, s.c(ajuster(p.feuillage, -14, 0, 4), 0.3))
  // Butte rocheuse.
  o += chemin(`M${x - 420} 720Q${x - 220} 640 ${x - 120} 640L${x + 130} 636Q${x + 260} 650 ${x + 430} 730Z`, s.c(assombrir(p.pierre, 0.35), 0.1))
  o += chemin(pts(x - lb, yB, x - lh, yT, x + lh, yT, x + lb, yB), pierre)
  o += chemin(pts(x + lb * 0.2, yB, x + lh * 0.2, yT, x + lh, yT, x + lb, yB), ombre, op(0.7))
  // Assises de pierre.
  let d = ''
  for (let y = yT + 40; y < yB; y += 46) d += `M${nb(x - lb + 6)} ${y}H${nb(x + lb - 6)}`
  o += trait(d, s.c(assombrir(p.pierre, 0.5), 0.06), 2, op(0.3))
  // Fenêtres étroites et porte.
  const lot = new Lot()
  let fen = ''
  for (const [dx, y] of [[-30, 290], [26, 380], [-22, 470], [30, 556]] as const) {
    const allumee = s.a.n() < s.e.vitres + 0.3 && s.e.lampes > 0
    fen += chemin(arche(p.arc, x + dx - 13, y + 52, 26, 52), allumee ? '#ffd98a' : s.c('#2f3a50', 0.06))
    if (allumee) halo(s, x + dx, y + 26, 70, p.lampe, 0.6)
    lot.rect(x + dx - 18, y + 52, 36, 6, s.c(eclaircir(p.pierre, 0.25), 0.06))
  }
  o += fen + lot.rendu()
  o += chemin(arche(p.arc, x - 24, yB, 48, 76), s.c(assombrir(p.bois, 0.4), 0.06))
  // Couronnement selon le thème.
  const toit = s.c(p.toit, 0.06)
  if (s.theme === 'orientale') {
    for (let i = 0; i < 3; i++) {
      const l = 250 - i * 50
      const y = yT + 20 - i * 78
      o += rect(x - l * 0.3, y - 60, l * 0.6, 62, s.c(i % 2 ? p.mur : p.boiserie, 0.06))
      o += chemin(toiture('orientale', x - l / 2, y - 40, l, 50), toit)
    }
    o += trait(ligne(x, yT - 196, x, yT - 250), s.c(p.metal, 0.06), 6)
  } else if (s.theme === 'gothique') {
    o += rect(x - lh - 12, yT - 14, 2 * lh + 24, 26, ombre)
    o += chemin(pts(x - lh - 4, yT - 14, x, yT - 250, x + lh + 4, yT - 14), toit)
    for (const dx of [-lh - 6, lh + 6]) o += chemin(pts(x + dx - 12, yT - 10, x + dx, yT - 96, x + dx + 12, yT - 10), s.c(assombrir(p.toit, 0.2), 0.06))
    o += cercle(x, yT + 56, 30, vitre(s, 0.1, 0.06)) + trait(disque(x, yT + 56, 30) + ligne(x - 30, yT + 56, x + 30, yT + 56) + ligne(x, yT + 26, x, yT + 86), ombre, 5)
  } else if (s.theme === 'steampunk') {
    o += rect(x - lh - 16, yT - 16, 2 * lh + 32, 28, s.c(p.metal, 0.06))
    o += chemin(`M${x - lh} ${yT - 16}A${lh} ${lh * 1.05} 0 0 1 ${x + lh} ${yT - 16}Z`, s.c(eclaircir(p.metal, 0.12), 0.06))
    o += trait(ligne(x, yT - 96, x, yT - 170), s.c('#3a3440', 0.06), 5) + cercle(x, yT - 174, 9, s.c(p.metal, 0.06))
    o += chemin(engrenage(x, yT + 70, 44, 10), s.c(p.metal, 0.06), PAIR)
    o += cercle(x, yT + 70, 13, s.e.lampes > 0 ? '#ffe9b0' : s.c('#efe4c8', 0.06))
    o += rect(x + lb - 8, 400, 16, 240, s.c(assombrir(p.metal, 0.3), 0.06)) + fumee(s, x + lb + 4, 384, 0.8)
  } else if (s.theme === 'moderne') {
    o += rect(x - lh - 30, yT - 40, 2 * lh + 60, 46, s.c('#8fa9c6', 0.06)) + rect(x - lh - 38, yT - 48, 2 * lh + 76, 10, s.c('#59616e', 0.06))
    let v = ''
    for (let i = 0; i < 8; i++) v += `M${nb(x - lh - 30 + (i * (2 * lh + 60)) / 8)} ${yT - 38}v44`
    o += trait(v, s.c('#dfeaf5', 0.06), 2, op(0.6)) + trait(ligne(x, yT - 48, x, yT - 150), s.c('#3a4250', 0.06), 5)
    o += cercle(x, yT - 150, 6, s.e.lampes > 0 ? '#ff5a4a' : s.c('#b03a30', 0.06))
    if (s.e.lampes > 0) halo(s, x, yT - 150, 60, '#ff5a4a', 0.7)
  } else {
    // Chemin de ronde, créneaux et toit conique.
    o += rect(x - lh - 18, yT - 30, 2 * lh + 36, 44, ombre)
    const cren = new Lot()
    for (let i = 0; i < 6; i++) cren.rect(x - lh - 18 + i * ((2 * lh + 36 - 24) / 5), yT - 52, 24, 24, ombre)
    o += cren.rendu()
    o += chemin(pts(x - lh + 4, yT - 30, x, yT - 230, x + lh - 4, yT - 30), toit)
    o += chemin(pts(x + 10, yT - 30, x, yT - 230, x + lh - 4, yT - 30), s.c(assombrir(p.toit, 0.25), 0.06), op(0.6))
    o += trait(ligne(x, yT - 230, x, yT - 290), s.c('#3a3440', 0.06), 3) + chemin(`M${x} ${yT - 290}Q${x + 30} ${yT - 296} ${x + 56} ${yT - 276}Q${x + 28} ${yT - 274} ${x} ${yT - 256}Z`, s.c(p.tissu, 0.06))
  }
  // Oiseaux.
  if (s.lum !== 'nuit') {
    const ro = creerAlea(deriver(s.graine, 'oiseaux'))
    let v = ''
    for (let i = 0; i < 7; i++) {
      const bx = (s.sens < 0 ? 620 : 700) + ro.entre(0, 300)
      const by = 150 + ro.entre(0, 170)
      const e = ro.entre(7, 13)
      v += `M${nb(bx - e)} ${nb(by - e * 0.4)}Q${nb(bx - e * 0.4)} ${nb(by - e * 0.7)} ${nb(bx)} ${nb(by)}Q${nb(bx + e * 0.4)} ${nb(by - e * 0.7)} ${nb(bx + e)} ${nb(by - e * 0.4)}`
    }
    o += trait(v, s.c('#2a2a36', 0.2), 2.5)
  }
  // Premier plan : lande et sentier.
  const herbe = ajuster(p.feuillage, -14, 0, 4)
  o += chemin(crete(s.a, 700, 60, 130, true), s.c(herbe, 0.12))
  o += chemin(`M${x - 30} 668C${x - 120} 720 ${nb(800 + (x - 800) * 0.3)} 780 ${nb(760 - (x - 800) * 0.1)} 900L${nb(900 - (x - 800) * 0.1)} 900C${nb(820 + (x - 800) * 0.36)} 790 ${x - 40} 730 ${x + 26} 668Z`, s.c('#d7c8a6', 0.05), op(0.85))
  for (const dx of [-330, -250, 300]) o += arbre(s, s.a, x + dx, 706 + s.a.entre(0, 20), s.a.entre(130, 200), 0.1, 'conifere')
  o += chemin(crete(s.a, 800, 50, 120, true), s.c(assombrir(herbe, 0.4)))
  o += chemin(touffes(creerAlea(deriver(s.graine, 'herbes')), 0, L, 790, 44, 22), s.c(assombrir(herbe, 0.4)))
  return o
}

function toit(s: Scene): string {
  const p = s.p
  const horizon = 640
  let o = ciel(s, horizon)
  // Ville au loin, sur deux plans.
  const rl = creerAlea(deriver(s.graine, 'lointain'))
  for (const [base, hMax, prof] of [[600, 150, 0.74], [640, 120, 0.5]] as const) {
    let d = `M-20 ${horizon + 60}`
    const lot = new Lot()
    for (let x = -20; x < L + 20; ) {
      const l = rl.entre(50, 130)
      const h = rl.entre(30, hMax) * (s.theme === 'moderne' ? 1.5 : 1)
      const y = base - h
      if (s.theme === 'moderne') d += `L${nb(x)} ${nb(y)}L${nb(x + l)} ${nb(y)}`
      else if (s.theme === 'orientale') d += `L${nb(x - 8)} ${nb(y + 4)}Q${nb(x + l * 0.2)} ${nb(y)} ${nb(x + l * 0.36)} ${nb(y - l * 0.2)}L${nb(x + l * 0.64)} ${nb(y - l * 0.2)}Q${nb(x + l * 0.8)} ${nb(y)} ${nb(x + l + 8)} ${nb(y + 4)}`
      else d += `L${nb(x)} ${nb(y)}L${nb(x + l / 2)} ${nb(y - l * (s.theme === 'gothique' ? 0.8 : 0.36))}L${nb(x + l)} ${nb(y)}`
      for (let k = 0; k < 3; k++) {
        const u = rl.n()
        const fx = x + rl.entre(6, l - 12)
        const fy = y + rl.entre(10, h + 20)
        if (u < s.e.vitres) lot.rect(fx, fy, 5, 7, '#ffd98a')
      }
      x += l
    }
    o += chemin(d + `L${L + 20} ${horizon + 60}Z`, s.c(p.pierre, prof)) + lot.rendu(op(0.9))
  }
  // Terrasse.
  const yS = 690
  const dalle = s.theme === 'moderne' ? p.pierre : p.toit
  o += rect(0, yS, L, H - yS, s.t.lineaire(0, yS, 0, H, [[0, s.c(dalle)], [1, s.c(assombrir(dalle, 0.5))]]))
  if (s.theme === 'moderne') {
    o += trait(fuyantes(yS, H, 800, 520, 200) + traverses(yS, H, 520), s.c(assombrir(dalle, 0.5)), 2, op(0.35))
  } else {
    // Rangs de tuiles.
    let d = ''
    for (let y = yS + 22, r = 0; y < H; y += 26 + r * 3, r++) {
      d += `M0 ${nb(y)}`
      for (let x = r % 2 ? -30 : 0; x < L; x += 60) d += `q30 ${nb(12 + r)} 60 0`
    }
    o += trait(d, s.c(assombrir(dalle, 0.5)), 2.5, op(0.4))
  }
  // Parapet ou garde-corps.
  const fer = s.c(assombrir(p.metal, 0.6))
  if (s.theme === 'moderne' || s.theme === 'steampunk') {
    let d = `M0 ${yS - 64}H${L}M0 ${yS - 34}H${L}`
    for (let x = 40; x < L; x += 120) d += `M${x} ${yS - 64}V${yS}`
    o += trait(d, fer, 5)
  } else {
    o += rect(0, yS - 46, L, 46, s.c(assombrir(p.pierre, 0.2))) + rect(0, yS - 54, L, 12, s.c(eclaircir(p.pierre, 0.12)))
    const lot = new Lot()
    for (let x = 30; x < L; x += 150) lot.rect(x, yS - 44, 10, 44, s.c(assombrir(p.pierre, 0.38)))
    o += lot.rendu(op(0.6))
  }
  // Cheminées d'un côté, édicule de l'autre.
  const xc = s.sens < 0 ? 1330 : 150
  const xe = s.sens < 0 ? 130 : 1270
  const brique = s.c(s.theme === 'moderne' ? '#8d949e' : ajuster(p.tissu, 10, -20, -4))
  o += rect(xc, 390, 110, 320, brique) + rect(xc + 74, 390, 36, 320, '#000000', op(0.2)) + rect(xc - 12, 374, 134, 22, s.c(assombrir(p.pierre, 0.3)))
  o += rect(xc + 14, 330, 28, 46, s.c(assombrir(p.pierre, 0.45))) + rect(xc + 66, 344, 28, 32, s.c(assombrir(p.pierre, 0.45)))
  o += rect(xc + 136, 500, 66, 210, brique) + rect(xc + 180, 500, 22, 210, '#000000', op(0.2)) + rect(xc + 128, 486, 82, 18, s.c(assombrir(p.pierre, 0.3)))
  o += fumee(s, xc + 28, 308, 1)
  if (s.theme === 'steampunk') {
    o += rect(xe, 560, 220, 16, s.c(p.metal)) + rect(xe + 30, 576, 16, 130, s.c(assombrir(p.metal, 0.2))) + rect(xe + 170, 576, 16, 130, s.c(assombrir(p.metal, 0.2)))
    o += chemin(engrenage(xe + 108, 500, 60, 12), s.c(p.metal), PAIR) + chemin(engrenage(xe + 190, 470, 34, 8), s.c(assombrir(p.metal, 0.25)), PAIR)
    // Dirigeable.
    const dx = 800 + s.sens * -260
    o += ellipse(dx, 200, 110, 34, s.c(p.tissu, 0.35)) + rect(dx - 30, 236, 60, 16, s.c(p.bois, 0.35), ' rx="6"') + trait(ligne(dx - 40, 228, dx - 24, 238) + ligne(dx + 40, 228, dx + 24, 238), s.c('#2a2a30', 0.35), 2)
    o += chemin(pts(dx - 104, 200, dx - 140, 176, dx - 140, 224), s.c(assombrir(p.tissu, 0.2), 0.35))
  } else if (s.theme === 'moderne') {
    o += rect(xe, 520, 200, 190, s.c('#a9b0ba')) + rect(xe + 130, 520, 70, 190, '#000000', op(0.14)) + rect(xe - 8, 508, 216, 16, s.c('#6c7480'))
    o += trait(ligne(xe + 50, 508, xe + 50, 380) + ligne(xe + 30, 410, xe + 70, 410) + ligne(xe + 36, 440, xe + 64, 440), s.c('#3a4250'), 4)
    o += trait(`M${xe + 130} 480A34 34 0 0 0 ${xe + 190} 470`, s.c('#dfe4ea'), 7) + trait(ligne(xe + 160, 478, xe + 160, 508), s.c('#3a4250'), 4)
  } else if (s.theme === 'orientale') {
    o += rect(xe + 20, 560, 180, 150, s.c(p.mur)) + chemin(toiture('orientale', xe, 566, 220, 70), s.c(p.toit))
    o += rect(xe + 84, 610, 52, 100, s.c(p.boiserie))
    o += lampe(s, xe + 250, 520, 0.8, 470) + trait(ligne(xe + 200, 474, xe + 262, 470), fer, 4)
  } else {
    // Lucarne.
    o += rect(xe + 10, 520, 250, 190, s.c(p.mur)) + rect(xe + 190, 520, 70, 190, '#000000', op(0.14))
    const ht = s.theme === 'gothique' ? 76 : 120
    o += chemin(toiture(s.theme, xe - 6, 526, 282, ht), s.c(assombrir(p.toit, 0.15)))
    o += chemin(arche(p.arc, xe + 92, 690, 86, 134), s.e.lampes > 0 ? '#ffd98a' : s.c('#3a4862'))
    o += trait(arche(p.arc, xe + 92, 690, 86, 134) + ligne(xe + 135, 560, xe + 135, 690) + ligne(xe + 92, 630, xe + 178, 630), s.c(assombrir(p.bois, 0.2)), 5)
    if (s.e.lampes > 0) halo(s, xe + 135, 630, 210, p.lampe, 0.6 * s.e.lampes)
    // Girouette.
    const yg = 526 - (s.theme === 'gothique' ? ht * 1.7 : ht)
    o += trait(ligne(xe + 135, yg, xe + 135, yg - 70) + ligne(xe + 100, yg - 52, xe + 170, yg - 52), fer, 4)
    o += chemin(pts(xe + 170, yg - 64, xe + 194, yg - 52, xe + 170, yg - 40) + pts(xe + 100, yg - 52, xe + 86, yg - 66, xe + 86, yg - 38), fer) + cercle(xe + 135, yg - 74, 6, fer)
  }
  return o
}

function rive(s: Scene): string {
  const p = s.p
  const horizon = 470
  const [, c1, c2, c3] = s.e.ciel
  let o = ciel(s, horizon)
  const rl = creerAlea(deriver(s.graine, 'lointain'))
  o += chemin(crete(rl, horizon + 4, 230, 70, false, horizon + 10), s.c(ajuster(p.pierre, 200, 8, -4), 0.78))
  o += chemin(crete(rl, horizon + 4, 130, 60, true, horizon + 10), s.c(p.feuillage, 0.6))
  o += chemin(crete(rl, horizon + 6, 54, 26, true, horizon + 10), s.c(assombrir(p.feuillage, 0.3), 0.4))
  // Eau : le ciel s'y reflète, plus sombre vers le premier plan.
  const eauPres = melanger(c1, s.e.ombre, 0.45)
  o += rect(0, horizon + 6, L, H - horizon, s.t.lineaire(0, horizon, 0, H, [[0, melanger(c3, c2, 0.4)], [0.35, melanger(c2, c1, 0.5)], [1, eauPres]]))
  // Reflet de l'astre.
  const ra = creerAlea(deriver(s.graine, 'ciel'))
  const ax = s.sens < 0 ? 190 + ra.n() * 280 : 1130 + ra.n() * 280
  const reflet = s.lum === 'nuit' ? '#dfe6ff' : s.lum === 'crepuscule' ? '#ffe2a6' : '#ffffff'
  const rr = creerAlea(deriver(s.graine, 'reflets'))
  let d = ''
  for (let y = horizon + 16, i = 0; y < 800; y += 9 + i * 1.3, i++) {
    const l = (16 + i * 7) * rr.entre(0.6, 1.2)
    const x = ax + rr.entre(-1, 1) * (8 + i * 3)
    d += `M${nb(x - l)} ${nb(y)}h${nb(2 * l)}`
  }
  o += trait(d, reflet, 4, op(s.lum === 'jour' ? 0.5 : 0.7))
  // Rides.
  let rides = ''
  let rides2 = ''
  for (let i = 0; i < 70; i++) {
    const y = horizon + 14 + rr.n() ** 1.6 * 300
    const l = 20 + ((y - horizon) / 300) * 120 * rr.entre(0.4, 1)
    const x = rr.entre(-40, L)
    if (i % 2) rides += `M${nb(x)} ${nb(y)}h${nb(l)}`
    else rides2 += `M${nb(x)} ${nb(y)}h${nb(l)}`
  }
  o += trait(rides, '#ffffff', 2.5, op(0.2)) + trait(rides2, s.e.ombre, 2.5, op(0.16))
  // Ponton, barque et lanterne, du côté opposé à l'astre.
  const cote = -s.sens
  const bx = 800 + cote * 390
  const bois = s.c(assombrir(p.bois, 0.25))
  const planche = s.c(eclaircir(p.bois, 0.12))
  o += chemin(pts(bx - 150, 640, bx + 150, 640, bx + 190 + cote * 60, 700, bx - 190 + cote * 60, 700), planche)
  let lattes = ''
  for (let i = 1; i < 8; i++) lattes += ligne(bx - 150 + i * 37.5, 640, bx - 190 + cote * 60 + i * 47.5, 700)
  o += trait(lattes, bois, 2.5, op(0.6))
  for (const dx of [-160, -40, 80, 190]) o += rect(bx + dx + cote * 30 - 7, 656, 14, 120, bois)
  o += rect(bx - 196 + cote * 60, 700, 392, 12, bois)
  const px = bx - cote * 120
  o += rect(px - 6, 520, 12, 130, bois) + trait(ligne(px, 524, px + cote * -40, 524), bois, 5)
  const lx = px - cote * 40
  const allumee = s.e.lampes > 0
  o += trait(ligne(lx, 524, lx, 540), bois, 3) + chemin(pts(lx - 13, 540, lx + 13, 540, lx + 10, 574, lx - 10, 574), allumee ? '#ffe2a0' : s.c('#b9c4cc'))
  o += rect(lx - 16, 536, 32, 6, bois) + rect(lx - 13, 572, 26, 5, bois)
  if (allumee) {
    halo(s, lx, 556, 230, p.lampe, 0.8 * s.e.lampes)
    halo(s, lx, 556, 60, '#fff8e0', 0.7 * s.e.lampes)
    o += trait(`M${nb(lx - 22)} 690h44M${nb(lx - 14)} 706h30M${nb(lx - 18)} 722h24`, p.lampe, 4, op(0.5 * s.e.lampes))
  }
  // Barque.
  const qx = bx - cote * 330
  o += chemin(`M${qx - 120} 610Q${qx - 90} 664 ${qx} 664Q${qx + 90} 664 ${qx + 120} 610${s.theme === 'orientale' ? `L${qx + 150} 584L${qx + 112} 618` : ''}Z`, s.c(assombrir(p.bois, 0.05), 0.04))
  o += chemin(`M${qx - 120} 610L${qx + 120} 610L${qx + 108} 626L${qx - 108} 626Z`, s.c(eclaircir(p.bois, 0.25), 0.04))
  o += rect(qx - 60, 664, 150, 4, s.e.ombre, op(0.25))
  // Rive du premier plan.
  const terre = ajuster(p.feuillage, -20, -6, 2)
  o += chemin(`M-20 900L-20 ${cote > 0 ? 690 : 770}Q${nb(800 - cote * 300)} ${cote > 0 ? 720 : 760} 800 790Q${nb(800 + cote * 400)} 830 ${L + 20} ${cote > 0 ? 770 : 690}L${L + 20} 900Z`, s.c(assombrir(terre, 0.3)))
  // Roseaux.
  const rh = creerAlea(deriver(s.graine, 'herbes'))
  const xr = 800 - cote * 620
  o += chemin(touffes(rh, xr - 190, xr + 190, 800, 230, 13), s.c(assombrir(terre, 0.5)))
  let q = ''
  for (let i = 0; i < 7; i++) {
    const x = xr - 160 + i * 50 + rh.entre(-12, 12)
    const h = rh.entre(170, 270)
    q += trait(`M${nb(x)} 800Q${nb(x + 6)} ${nb(800 - h * 0.5)} ${nb(x + 14)} ${nb(800 - h)}`, s.c(assombrir(terre, 0.55)), 3)
    q += rect(x + 9, 800 - h - 6, 10, 38, s.c(assombrir(p.bois, 0.35)), ' rx="5"')
  }
  o += q
  o += chemin(touffes(rh, -10, L + 10, 870, 70, 26), s.c(assombrir(terre, 0.6)))
  // Saule en surplomb.
  const sx = 800 - cote * 760
  let fr = ''
  for (let i = 0; i < 16; i++) {
    const x0 = sx + cote * i * 26
    const h = rh.entre(190, 420) * (1 - i / 22)
    fr += `M${nb(x0)} -10Q${nb(x0 + cote * 30)} ${nb(h * 0.5)} ${nb(x0 + cote * 12)} ${nb(h)}`
  }
  o += trait(fr, s.c(assombrir(p.feuillage, 0.45)), 9) + trait(fr, s.c(assombrir(p.feuillage, 0.2)), 3, op(0.7))
  return o
}

// ───────────────────────── Assemblage ─────────────────────────

const SCENES: Record<TypeLieu, { interieur: boolean; dessin: (s: Scene) => string }> = {
  salle: { interieur: true, dessin: salle },
  bibliotheque: { interieur: true, dessin: bibliotheque },
  cour: { interieur: false, dessin: cour },
  jardin: { interieur: false, dessin: jardin },
  dortoir: { interieur: true, dessin: dortoir },
  refectoire: { interieur: true, dessin: refectoire },
  arene: { interieur: false, dessin: arene },
  couloir: { interieur: true, dessin: couloir },
  ville: { interieur: false, dessin: ville },
  foret: { interieur: false, dessin: foret },
  tour: { interieur: false, dessin: tour },
  souterrain: { interieur: true, dessin: souterrain },
  bureau: { interieur: true, dessin: bureau },
  toit: { interieur: false, dessin: toit },
  rive: { interieur: false, dessin: rive },
}

/** Ciel teinté par le thème. */
function eclairage(lum: Lumiere, p: Palette): Eclairage {
  const e = ECLAIRAGES[lum]
  if (p.forceCiel <= 0) return e
  const k = lum === 'nuit' ? p.forceCiel * 0.5 : p.forceCiel
  const ciel = e.ciel.map((c) => melanger(c, multiplier(p.teinteCiel, lum === 'nuit' ? '#3a4a80' : '#ffffff'), k)) as Eclairage['ciel']
  return { ...e, ciel }
}

/** Décor 1600×900. Même (type, graine, theme) ⇒ même composition ; seule la lumière change entre jour / crepuscule / nuit. */
export function decorSvg(o: { type: TypeLieu; lumiere: Lumiere; graine: number; theme: ThemeArt; nom?: string }): string {
  const theme: ThemeArt = o.theme in PALETTES ? o.theme : 'libre'
  const type: TypeLieu = o.type in SCENES ? o.type : 'cour'
  const lum: Lumiere = o.lumiere in ECLAIRAGES ? o.lumiere : 'jour'
  const p = PALETTES[theme]
  const e = eclairage(lum, p)
  const graine = deriver(o.graine, 'decor:' + type + ':' + theme)
  const def = SCENES[type]
  const s: Scene = {
    t: new Toile(prefixeId('d', o.graine, type + theme + lum)),
    a: creerAlea(graine),
    graine,
    theme,
    lum,
    p,
    e,
    interieur: def.interieur,
    sens: creerAlea(deriver(graine, 'astre')).chance(0.5) ? -1 : 1,
    rayons: [],
    lueurs: [],
    c: (couleur, profondeur = 0) => melanger(multiplier(couleur, def.interieur ? e.interieur : e.ambiante), e.brume, profondeur),
  }
  let corps = def.dessin(s) + s.lueurs.join('')
  // Une graine sur deux retourne la composition, pour varier.
  if (creerAlea(deriver(graine, 'miroir')).chance(0.5)) corps = `<g transform="translate(${L} 0) scale(-1 1)">${corps}</g>`
  // Finitions : assombrissement du tiers inférieur (boîte de dialogue), vignette, voile de couleur.
  const bas = s.t.lineaire(0, 520, 0, H, [[0, e.ombre, 0], [0.55, e.ombre, e.forceOmbre * 0.62], [1, e.ombre, e.forceOmbre]])
  const vignette = s.t.radial(800, 400, 1050, [[0.55, e.ombre, 0], [1, e.ombre, 0.5]])
  const titre = o.nom ? `<title>${echapper(o.nom)}</title>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${H}" width="${L}" height="${H}" preserveAspectRatio="xMidYMid slice" role="img">`
    + titre + s.t.rendu()
    + corps
    + rect(0, 0, L, H, bas) + rect(0, 0, L, H, vignette)
    + '</svg>'
}
