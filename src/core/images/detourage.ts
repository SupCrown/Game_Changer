/**
 * Détourage automatique : rend transparent le fond uni d'un sprite, sans dépendance.
 *
 * Méthode : la couleur du fond est estimée sur le pourtour de l'image, puis on « inonde » depuis les
 * bords tous les pixels proches de cette couleur. Un vêtement blanc au milieu du personnage n'est donc
 * pas troué, puisqu'il n'est pas relié au bord. Une passe finale adoucit le liseré.
 *
 * Travaille sur un tampon de 4 octets par pixel, alpha en dernière position, couleurs prémultipliées
 * (format des bitmaps d'Electron). L'ordre des trois canaux de couleur est indifférent.
 */

function mediane(valeurs: number[]): number {
  const t = [...valeurs].sort((a, b) => a - b)
  return t[Math.floor(t.length / 2)] ?? 0
}

export interface ResultatDetourage {
  /** Part de l'image rendue transparente (0..1). */
  partFond: number
  fond: [number, number, number]
}

export function detourer(px: Uint8Array | Uint8ClampedArray, largeur: number, hauteur: number, tolerance = 34): ResultatDetourage {
  const n = largeur * hauteur
  if (px.length < n * 4 || n === 0) return { partFond: 0, fond: [0, 0, 0] }

  // 1. Couleur du fond : médiane des pixels du pourtour.
  const c: [number[], number[], number[]] = [[], [], []]
  const echantillon = (x: number, y: number) => {
    const i = (y * largeur + x) * 4
    c[0].push(px[i]); c[1].push(px[i + 1]); c[2].push(px[i + 2])
  }
  const pas = Math.max(1, Math.floor(Math.max(largeur, hauteur) / 200))
  for (let x = 0; x < largeur; x += pas) { echantillon(x, 0); echantillon(x, hauteur - 1) }
  // Le bas de l'image est souvent occupé par le buste : on n'échantillonne que les deux tiers supérieurs des côtés.
  for (let y = 0; y < hauteur * 0.66; y += pas) { echantillon(0, y); echantillon(largeur - 1, y) }
  const fond: [number, number, number] = [mediane(c[0]), mediane(c[1]), mediane(c[2])]

  const distance = (i: number) => {
    const a = px[i] - fond[0], b = px[i + 1] - fond[1], d = px[i + 2] - fond[2]
    return Math.sqrt(a * a + b * b + d * d)
  }

  // 2. Inondation depuis les bords (haut et côtés ; le bas appartient en général au personnage).
  const masque = new Uint8Array(n) // 1 = fond
  const pile = new Int32Array(n)
  let sommet = 0
  const semer = (x: number, y: number) => {
    const k = y * largeur + x
    if (!masque[k] && distance(k * 4) <= tolerance) { masque[k] = 1; pile[sommet++] = k }
  }
  for (let x = 0; x < largeur; x++) semer(x, 0)
  for (let y = 0; y < hauteur; y++) { semer(0, y); semer(largeur - 1, y) }
  for (let x = 0; x < largeur; x++) semer(x, hauteur - 1)
  while (sommet > 0) {
    const k = pile[--sommet]
    const x = k % largeur
    const y = (k - x) / largeur
    if (x > 0) semer(x - 1, y)
    if (x < largeur - 1) semer(x + 1, y)
    if (y > 0) semer(x, y - 1)
    if (y < hauteur - 1) semer(x, y + 1)
  }

  // 3. Application : fond transparent, liseré adouci selon la proximité avec la couleur du fond.
  let transparents = 0
  const douceur = tolerance * 2.2
  for (let k = 0; k < n; k++) {
    const i = k * 4
    if (masque[k]) {
      px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0
      transparents++
      continue
    }
    const x = k % largeur
    const y = (k - x) / largeur
    const bord = (x > 0 && masque[k - 1]) || (x < largeur - 1 && masque[k + 1]) || (y > 0 && masque[k - largeur]) || (y < hauteur - 1 && masque[k + largeur])
    if (!bord) continue
    const d = distance(i)
    if (d < douceur) {
      const a = Math.max(0.15, d / douceur)
      // Retire la part de fond mêlée au pixel (anti-liseré), puis prémultiplie.
      for (let j = 0; j < 3; j++) {
        const pur = Math.max(0, Math.min(255, (px[i + j] - fond[j] * (1 - a)) / a))
        px[i + j] = Math.round(pur * a)
      }
      px[i + 3] = Math.round(px[i + 3] * a)
    }
  }
  return { partFond: transparents / n, fond }
}

/** Un détourage est jugé raté s'il n'a presque rien retiré (fond non uni) ou presque tout (personnage effacé). */
export function detourageCredible(r: ResultatDetourage): boolean {
  return r.partFond > 0.12 && r.partFond < 0.9
}
