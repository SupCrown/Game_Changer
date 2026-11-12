/**
 * Dé virtuel en 3D : un icosaèdre projeté sur un canvas 2D (aucune bibliothèque).
 * Le résultat est décidé par le moteur de règles ; l'animation ne fait que l'amener face au joueur.
 */
import { useEffect, useRef } from 'react'

type V3 = [number, number, number]

const PHI = (1 + Math.sqrt(5)) / 2
const SOMMETS: V3[] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI],
  [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map(([x, y, z]) => { const n = Math.hypot(x, y, z); return [x / n, y / n, z / n] as V3 })
const FACES: [number, number, number][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
]

const croix = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const scal = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norme = (a: V3): V3 => { const n = Math.hypot(...a) || 1; return [a[0] / n, a[1] / n, a[2] / n] }

/** Rotation de `v` autour de l'axe unitaire `k` (formule de Rodrigues). */
function tourner(v: V3, k: V3, angle: number): V3 {
  const c = Math.cos(angle), s = Math.sin(angle), kv = croix(k, v), d = scal(k, v) * (1 - c)
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d]
}

const CENTRES: V3[] = FACES.map(([a, b, c]) => norme([SOMMETS[a][0] + SOMMETS[b][0] + SOMMETS[c][0], SOMMETS[a][1] + SOMMETS[b][1] + SOMMETS[c][1], SOMMETS[a][2] + SOMMETS[b][2] + SOMMETS[c][2]]))

export function De3D(p: { valeur: number; etiquettes: string[]; taille?: number; couleur?: string; duree?: number; onFini?(): void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const taille = p.taille ?? 240

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.height = taille * dpr
    ctx.scale(dpr, dpr)
    const face = Math.max(0, p.etiquettes.indexOf(String(p.valeur)))
    // Rotation finale : amène le centre de la face voulue sur l'axe du regard (+z).
    const cible = CENTRES[face]
    const regard: V3 = [0, 0, 1]
    let axeFinal = croix(cible, regard)
    const angleFinal = Math.acos(Math.max(-1, Math.min(1, scal(cible, regard))))
    axeFinal = Math.hypot(...axeFinal) < 1e-6 ? [1, 0, 0] : norme(axeFinal)
    const axeRoulis = norme([0.6, 1, 0.35])
    const duree = p.duree ?? 1500
    const debut = performance.now()
    let image = 0
    let fini = false

    const dessiner = (maintenant: number) => {
      const u = Math.min(1, (maintenant - debut) / duree)
      const reste = (1 - u) ** 3 // décélération
      const roulis = reste * 22
      const pts = SOMMETS.map((v) => tourner(tourner(tourner(v, axeFinal, angleFinal), axeRoulis, roulis), [1, 0, 0], reste * 9))
      ctx.clearRect(0, 0, taille, taille)
      const r = taille * 0.36
      const cx = taille / 2
      const cy = taille / 2 - Math.abs(Math.sin(u * Math.PI * 3)) * reste * taille * 0.18
      const proj = (v: V3): [number, number] => { const f = 3.2 / (3.2 - v[2]); return [cx + v[0] * r * f, cy - v[1] * r * f] }
      // Ombre au sol
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath()
      ctx.ellipse(cx, taille * 0.9, r * 0.8 * (1 - reste * 0.3), r * 0.16, 0, 0, 7)
      ctx.fill()
      const visibles = FACES.map((f, i) => {
        const [a, b, c] = [pts[f[0]], pts[f[1]], pts[f[2]]]
        const n = norme(croix([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]))
        return { i, a, b, c, n, z: (a[2] + b[2] + c[2]) / 3 }
      }).filter((f) => f.n[2] > 0.02).sort((x, y) => x.z - y.z)
      for (const f of visibles) {
        const lumiere = Math.max(0, scal(f.n, norme([-0.4, 0.7, 0.8])))
        const [pa, pb, pc] = [proj(f.a), proj(f.b), proj(f.c)]
        ctx.beginPath()
        ctx.moveTo(...pa); ctx.lineTo(...pb); ctx.lineTo(...pc); ctx.closePath()
        ctx.fillStyle = `color-mix(in srgb, ${p.couleur ?? '#d9b56d'} ${Math.round(28 + lumiere * 62)}%, #14100a)`
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 244, 214, 0.55)'
        ctx.lineWidth = 1.2
        ctx.stroke()
        if (f.n[2] > 0.35) {
          const [tx, ty] = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3]
          ctx.save()
          ctx.translate(tx, ty)
          ctx.scale(0.6 + f.n[2] * 0.4, 0.6 + f.n[2] * 0.4)
          ctx.fillStyle = `rgba(20, 14, 6, ${0.35 + f.n[2] * 0.6})`
          ctx.font = `700 ${Math.round(r * (p.etiquettes[f.i].length > 1 ? 0.3 : 0.36))}px Georgia, serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(p.etiquettes[f.i], 0, 0)
          ctx.restore()
        }
      }
      if (u < 1) image = requestAnimationFrame(dessiner)
      else if (!fini) { fini = true; p.onFini?.() }
    }
    image = requestAnimationFrame(dessiner)
    return () => cancelAnimationFrame(image)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.valeur, taille])

  return <canvas ref={ref} style={{ width: taille, height: taille }} />
}

export const ETIQUETTES_D20 = Array.from({ length: 20 }, (_, i) => String(i + 1))
/** Pour un D100 : deux dés à vingt faces, chacun portant deux fois chaque chiffre. */
export const ETIQUETTES_DIZAINES = Array.from({ length: 20 }, (_, i) => `${(i % 10) * 10}`.padStart(2, '0'))
export const ETIQUETTES_UNITES = Array.from({ length: 20 }, (_, i) => String(i % 10))
