/** Petits composants et crochets partagés par les écrans. */
import { useEffect, type ReactNode } from 'react'
import { useJeu } from './store'
import { MoteurAudio } from './audio/moteur'

export const audio = new MoteurAudio()

/** URL de l'image pour cette clé ; la demande part au premier affichage. */
export function useImage(cle: string | null): string | undefined {
  const url = useJeu((s) => (cle ? s.images[cle] : undefined))
  const demander = useJeu((s) => s.demanderImage)
  const partie = useJeu((s) => s.etat?.id)
  useEffect(() => {
    if (cle && !url) demander(cle)
  }, [cle, url, demander, partie])
  return url
}

export function Champ(p: { titre: string; aide?: string; children: ReactNode }) {
  return (
    <label className="champ">
      <span>{p.titre}</span>
      {p.children}
      {p.aide && <div className="aide">{p.aide}</div>}
    </label>
  )
}

export function Bascule(p: { titre: string; valeur: boolean; onChange(v: boolean): void; aide?: string }) {
  return (
    <>
      <label className="bascule">
        <input type="checkbox" checked={p.valeur} onChange={(e) => p.onChange(e.target.checked)} />
        <span>{p.titre}</span>
      </label>
      {p.aide && <div className="aide" style={{ marginTop: '-0.3em', marginLeft: '1.7em' }}>{p.aide}</div>}
    </>
  )
}

export function Choix<T extends string>(p: { titre: string; valeur: T; options: [T, string][]; onChange(v: T): void; aide?: string }) {
  return (
    <Champ titre={p.titre} aide={p.aide}>
      <select value={p.valeur} onChange={(e) => p.onChange(e.target.value as T)}>
        {p.options.map(([v, nom]) => <option key={v} value={v}>{nom}</option>)}
      </select>
    </Champ>
  )
}

export function Curseur(p: { titre: string; valeur: number; min: number; max: number; pas?: number; onChange(v: number): void; affiche?: string }) {
  return (
    <Champ titre={`${p.titre}${p.affiche ? ` — ${p.affiche}` : ''}`}>
      <input type="range" min={p.min} max={p.max} step={p.pas ?? 1} value={p.valeur} onChange={(e) => p.onChange(Number(e.target.value))} />
    </Champ>
  )
}

export function Jauge(p: { valeur: number; max: number; couleur?: string }) {
  const part = Math.max(0, Math.min(100, (p.valeur / Math.max(1, p.max)) * 100))
  return <div className="jauge"><i style={{ width: `${part}%`, background: p.couleur }} /></div>
}

export function dollars(n: number): string {
  if (n === 0) return '0 $'
  return n < 0.01 ? `${n.toFixed(4)} $` : `${n.toFixed(2)} $`
}

export function dateCourte(ms: number): string {
  return new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
