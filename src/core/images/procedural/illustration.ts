/**
 * Illustration d'événement (« CG ») procédurale : composition abstraite et évocatrice selon l'humeur,
 * avec le titre intégré discrètement. 1600×900, déterministe.
 */
import type { Humeur } from '@shared/types'
import { creerAlea, echapper, nb, prefixeId } from './alea'
import type { ThemeArt } from './decor'

interface Ambiance { haut: string; bas: string; lueur: string; motif: string; encre: string }

const AMBIANCES: Record<Humeur, Ambiance> = {
  calme: { haut: '#22355a', bas: '#0f1a30', lueur: '#f3e2b0', motif: '#cfe0f5', encre: '#f4ead2' },
  joyeux: { haut: '#f0b35e', bas: '#b8553f', lueur: '#fff3c4', motif: '#ffe9a8', encre: '#fff7e0' },
  tendu: { haut: '#3a2530', bas: '#120c12', lueur: '#d9694f', motif: '#b84c3c', encre: '#f1ddd2' },
  mystere: { haut: '#1d2447', bas: '#07091a', lueur: '#8f9cf0', motif: '#aab4ff', encre: '#e3e6ff' },
  romance: { haut: '#f2a58e', bas: '#6d3a5e', lueur: '#ffe3c2', motif: '#ffd0d8', encre: '#fff1e6' },
  combat: { haut: '#5a1f1c', bas: '#150909', lueur: '#ffb35c', motif: '#ffd9a0', encre: '#ffe9d0' },
  triste: { haut: '#2c3a4c', bas: '#0d131c', lueur: '#9fb6cf', motif: '#b9cbe0', encre: '#dfe8f2' },
}

export function illustrationSvg(o: { graine: number; titre: string; humeur: Humeur; theme: ThemeArt }): string {
  const a = AMBIANCES[o.humeur] ?? AMBIANCES.calme
  const r = creerAlea(o.graine)
  const id = prefixeId('cg', o.graine, o.humeur)
  const L = 1600, H = 900
  const cx = r.entre(520, 1080), cy = r.entre(300, 470)
  let corps = ''

  // Astre ou foyer de lumière.
  corps += `<circle cx="${nb(cx)}" cy="${nb(cy)}" r="${nb(r.entre(360, 520))}" fill="url(#${id}l)"/>`
  if (o.humeur !== 'tendu' && o.humeur !== 'combat') {
    corps += `<circle cx="${nb(cx)}" cy="${nb(cy)}" r="${nb(r.entre(70, 120))}" fill="${a.lueur}" opacity="0.85"/>`
  }

  if (o.humeur === 'mystere') {
    // Cercles runiques concentriques.
    for (let i = 0; i < 4; i++) {
      const rayon = 150 + i * 70 + r.entre(-10, 10)
      corps += `<circle cx="${nb(cx)}" cy="${nb(cy)}" r="${nb(rayon)}" fill="none" stroke="${a.motif}" stroke-width="${i % 2 ? 1 : 2.5}" stroke-dasharray="${nb(r.entre(4, 40))} ${nb(r.entre(8, 30))}" opacity="${nb(0.55 - i * 0.09)}"/>`
    }
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * Math.PI * 2 + r.entre(0, 0.2)
      corps += `<circle cx="${nb(cx + Math.cos(t) * 220)}" cy="${nb(cy + Math.sin(t) * 220)}" r="5" fill="${a.motif}" opacity="0.7"/>`
    }
  } else if (o.humeur === 'combat' || o.humeur === 'tendu') {
    // Diagonales et éclats.
    for (let i = 0; i < 9; i++) {
      const x = r.entre(-200, L), l = r.entre(30, 150)
      corps += `<polygon points="${nb(x)},${H} ${nb(x + l)},${H} ${nb(x + l + 620)},0 ${nb(x + 620)},0" fill="${i % 3 ? a.motif : a.lueur}" opacity="${nb(r.entre(0.04, 0.16))}"/>`
    }
    for (let i = 0; i < 26; i++) {
      const x = cx + r.entre(-560, 560), y = cy + r.entre(-300, 380), t = r.entre(6, 26), rot = r.entre(0, 180)
      corps += `<polygon points="0,${nb(-t)} ${nb(t * 0.3)},0 0,${nb(t)} ${nb(-t * 0.3)},0" transform="translate(${nb(x)} ${nb(y)}) rotate(${nb(rot)})" fill="${a.lueur}" opacity="${nb(r.entre(0.3, 0.9))}"/>`
    }
  } else if (o.humeur === 'triste') {
    for (let i = 0; i < 150; i++) {
      const x = r.entre(0, L), y = r.entre(0, H), l = r.entre(18, 46)
      corps += `<line x1="${nb(x)}" y1="${nb(y)}" x2="${nb(x - l * 0.25)}" y2="${nb(y + l)}" stroke="${a.motif}" stroke-width="1.3" opacity="${nb(r.entre(0.12, 0.4))}"/>`
    }
  } else {
    // Pétales, lucioles ou poussière de lumière.
    const n = o.humeur === 'romance' ? 46 : 60
    for (let i = 0; i < n; i++) {
      const x = r.entre(0, L), y = r.entre(0, H), t = r.entre(3, 12)
      corps += o.humeur === 'romance'
        ? `<ellipse cx="${nb(x)}" cy="${nb(y)}" rx="${nb(t * 1.6)}" ry="${nb(t * 0.8)}" transform="rotate(${nb(r.entre(0, 180))} ${nb(x)} ${nb(y)})" fill="${a.motif}" opacity="${nb(r.entre(0.3, 0.85))}"/>`
        : `<circle cx="${nb(x)}" cy="${nb(y)}" r="${nb(t * 0.4)}" fill="${a.motif}" opacity="${nb(r.entre(0.25, 0.9))}"/>`
    }
  }

  // Horizon en couches, puis deux silhouettes lointaines (adultes, de dos) pour donner l'échelle.
  for (let c = 0; c < 3; c++) {
    const base = 620 + c * 80
    let d = `M0 ${H} L0 ${nb(base + r.entre(-30, 30))}`
    for (let x = 0; x <= L; x += 100) d += ` L${x} ${nb(base + Math.sin(x / 190 + c * 2 + r.entre(0, 1)) * 34 + r.entre(-14, 14))}`
    corps += `<path d="${d} L${L} ${H} Z" fill="${a.bas}" opacity="${nb(0.5 + c * 0.22)}"/>`
  }
  if (o.humeur === 'romance' || o.humeur === 'calme' || o.humeur === 'joyeux' || o.humeur === 'triste') {
    const sx = cx + r.entre(-120, 120), ecart = o.humeur === 'triste' ? 150 : 46
    for (const dx of [-ecart / 2, ecart / 2]) {
      const x = sx + dx, y = 700
      corps += `<g fill="#06070c" opacity="0.92"><circle cx="${nb(x)}" cy="${nb(y - 98)}" r="13"/><path d="M${nb(x - 17)} ${nb(y - 80)} Q${nb(x)} ${nb(y - 92)} ${nb(x + 17)} ${nb(y - 80)} L${nb(x + 21)} ${y} L${nb(x - 21)} ${y} Z"/></g>`
    }
  }

  const titre = echapper(o.titre.slice(0, 70))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${H}" width="${L}" height="${H}">`
    + `<defs><linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.haut}"/><stop offset="1" stop-color="${a.bas}"/></linearGradient>`
    + `<radialGradient id="${id}l"><stop offset="0" stop-color="${a.lueur}" stop-opacity="0.75"/><stop offset="1" stop-color="${a.lueur}" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="${id}v" x1="0" y1="0" x2="0" y2="1"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.7"/></linearGradient></defs>`
    + `<rect width="${L}" height="${H}" fill="url(#${id}f)"/>${corps}<rect width="${L}" height="${H}" fill="url(#${id}v)"/>`
    + (titre ? `<text x="${L / 2}" y="842" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="34" fill="${a.encre}" opacity="0.9" letter-spacing="2">${titre}</text>` : '')
    + '</svg>'
}
