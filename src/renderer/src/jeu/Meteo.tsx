/** Effets météo légers : pluie, neige, pétales, brume. Un canvas, quelques dizaines de particules. */
import { useEffect, useRef } from 'react'

export function Meteo(p: { genre: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !p.genre) return
    const ctx = c.getContext('2d')!
    const n = p.genre === 'pluie' ? 140 : p.genre === 'brume' ? 14 : 60
    const parts = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), v: 0.5 + Math.random(), a: Math.random() * 7, t: 0.5 + Math.random() }))
    let image = 0
    let avant = performance.now()
    const dessiner = (maintenant: number) => {
      const dt = Math.min(0.05, (maintenant - avant) / 1000)
      avant = maintenant
      const l = (c.width = c.clientWidth)
      const h = (c.height = c.clientHeight)
      ctx.clearRect(0, 0, l, h)
      for (const q of parts) {
        if (p.genre === 'pluie') {
          q.y += dt * 1.9 * q.v; q.x -= dt * 0.18
          ctx.strokeStyle = 'rgba(190, 210, 240, 0.35)'
          ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(q.x * l, q.y * h); ctx.lineTo(q.x * l - 5, q.y * h + 20 * q.v); ctx.stroke()
        } else if (p.genre === 'neige') {
          q.y += dt * 0.12 * q.v; q.a += dt; q.x += Math.sin(q.a) * dt * 0.03
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
          ctx.beginPath(); ctx.arc(q.x * l, q.y * h, 1.4 + q.t * 1.6, 0, 7); ctx.fill()
        } else if (p.genre === 'petales') {
          q.y += dt * 0.1 * q.v; q.a += dt * 1.6; q.x += (0.04 + Math.sin(q.a) * 0.05) * dt
          ctx.save(); ctx.translate(q.x * l, q.y * h); ctx.rotate(q.a)
          ctx.fillStyle = 'rgba(248, 190, 205, 0.8)'
          ctx.beginPath(); ctx.ellipse(0, 0, 6 * q.t, 3 * q.t, 0, 0, 7); ctx.fill(); ctx.restore()
        } else {
          q.x += dt * 0.012 * q.v
          const g = ctx.createRadialGradient(q.x * l, (0.45 + q.y * 0.5) * h, 0, q.x * l, (0.45 + q.y * 0.5) * h, 320 * q.t)
          g.addColorStop(0, 'rgba(220, 225, 235, 0.11)'); g.addColorStop(1, 'rgba(220, 225, 235, 0)')
          ctx.fillStyle = g
          ctx.fillRect(0, 0, l, h)
        }
        if (q.y > 1.05) { q.y = -0.05; q.x = Math.random() }
        if (q.x > 1.1) q.x = -0.1
        if (q.x < -0.1) q.x = 1.1
      }
      image = requestAnimationFrame(dessiner)
    }
    image = requestAnimationFrame(dessiner)
    return () => cancelAnimationFrame(image)
  }, [p.genre])
  if (!p.genre) return null
  return <canvas ref={ref} className="meteo" style={{ width: '100%', height: '100%' }} />
}
