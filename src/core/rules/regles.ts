/**
 * Paramètres du moteur de règles. Les valeurs par défaut vivent ici ;
 * `packs/regles/defaut.json` peut en surcharger tout ou partie sans toucher au code.
 */
export interface Regles {
  resonance: {
    /** Gain maximal cumulé par scène pour une même héroïne. */
    maxParScene: number
    /** Perte maximale cumulée par scène. */
    minParScene: number
    /** À partir de ce niveau chez les deux rivales, un gain chez l'une coûte chez l'autre. */
    seuilJalousie: number
    /** Part du gain retirée à la rivale (0.33 = un tiers). */
    partJalousie: number
  }
  reputation: { maxParScene: number; hostile: number; protecteur: number }
  heros: { perteMaxPvParScene: number; gainMaxOrParScene: number; objetsMaxParScene: number; statMax: number; entrainementsParPoint: number }
  jets: { ddMin: number; ddMax: number; ajustement: Record<'clemente' | 'normale' | 'rude', number> }
  rythme: Record<'lent' | 'normal' | 'soutenu', { indicesParChapitre: number; ecartMin: number; debutSansMystere: number }>
  calendrier: { scenesMaxParCreneau: number; joursParChapitre: number }
}

export const REGLES_DEFAUT: Regles = {
  resonance: { maxParScene: 15, minParScene: -20, seuilJalousie: 25, partJalousie: 0.34 },
  reputation: { maxParScene: 15, hostile: -50, protecteur: 50 },
  heros: { perteMaxPvParScene: 25, gainMaxOrParScene: 30, objetsMaxParScene: 3, statMax: 18, entrainementsParPoint: 3 },
  jets: { ddMin: 5, ddMax: 25, ajustement: { clemente: -2, normale: 0, rude: 2 } },
  rythme: {
    lent: { indicesParChapitre: 1, ecartMin: 12, debutSansMystere: 14 },
    normal: { indicesParChapitre: 2, ecartMin: 8, debutSansMystere: 10 },
    soutenu: { indicesParChapitre: 3, ecartMin: 5, debutSansMystere: 6 },
  },
  calendrier: { scenesMaxParCreneau: 2, joursParChapitre: 7 },
}

/** Fusion profonde et prudente : une valeur n'est remplacée que si elle a le même type. */
export function fusionnerRegles(base: Regles, surcharge: unknown): Regles {
  const fusion = (a: any, b: any): any => {
    if (b === null || typeof b !== 'object' || Array.isArray(b)) return a
    const r: any = { ...a }
    for (const k of Object.keys(a)) {
      if (!(k in b)) continue
      if (typeof a[k] === 'object' && a[k] !== null) r[k] = fusion(a[k], b[k])
      else if (typeof b[k] === typeof a[k] && (typeof b[k] !== 'number' || Number.isFinite(b[k]))) r[k] = b[k]
    }
    return r
  }
  return fusion(base, surcharge)
}
