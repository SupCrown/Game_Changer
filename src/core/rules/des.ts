/** Dés, modificateurs et résolution des jets. Entièrement déterministe. */
import type { De, DemandeJet, Hero, ResultatJet, StatId, Preferences } from '@shared/types'
import { STATS } from '@shared/types'
import { estStat, nombre, txt } from '@core/ai/schemas'
import type { Regles } from './regles'

/** Générateur pseudo-aléatoire à graine (mulberry32). */
export function alea(graine: number): () => number {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function grainede(texte: string): number {
  let h = 2166136261
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function faces(de: De): number {
  return de === 'D100' ? 100 : 20
}

export function lancer(de: De, rnd: () => number = Math.random): number {
  return 1 + Math.floor(rnd() * faces(de))
}

export function modificateur(valeurStat: number): number {
  return Math.floor((valeurStat - 10) / 2)
}

/** Bonus d'état : les états connus pèsent sur les jets (le moteur décide, pas l'IA). */
export function malusEtats(hero: Hero): number {
  let m = 0
  for (const e of hero.etats) {
    const s = e.toLowerCase()
    if (/bless|épuis|epuis|malade|empoisonn|terrifi/.test(s)) m -= 2
    else if (/fatigu|troubl|distrai|étourdi|etourdi/.test(s)) m -= 1
    else if (/inspir|concentr|reposé|repose|galvanis/.test(s)) m += 1
  }
  return Math.max(-4, Math.min(2, m))
}

/**
 * Valide une demande de jet émise par le Narrateur. Renvoie null si elle est inexploitable.
 * La difficulté est bornée et ajustée selon le réglage de difficulté du joueur.
 */
export function validerDemande(brut: { de?: unknown; stat?: unknown; difficulte?: unknown; motif?: unknown }, prefs: Pick<Preferences, 'difficulte'>, regles: Regles): DemandeJet | null {
  const de: De = /100/.test(txt(brut.de)) ? 'D100' : 'D20'
  const stat = estStat(brut.stat) ?? 'volonte'
  let dd = Math.round(nombre(brut.difficulte, de === 'D100' ? 50 : 12))
  const ajust = regles.jets.ajustement[prefs.difficulte] ?? 0
  if (de === 'D100') {
    dd = Math.max(regles.jets.ddMin * 4, Math.min(regles.jets.ddMax * 4, dd + ajust * 5))
  } else {
    dd = Math.max(regles.jets.ddMin, Math.min(regles.jets.ddMax, dd + ajust))
  }
  const motif = txt(brut.motif).slice(0, 160)
  if (!motif) return null
  return { de, stat, difficulte: dd, motif }
}

/** Résout un jet : la valeur vient du joueur (dés réels) ou du lancer virtuel. */
export function resoudre(demande: DemandeJet, valeur: number, hero: Hero, virtuel: boolean): ResultatJet {
  const max = faces(demande.de)
  const v = Math.max(1, Math.min(max, Math.round(valeur)))
  const echelle = demande.de === 'D100' ? 5 : 1
  const mod = (modificateur(hero.stats[demande.stat]) + malusEtats(hero)) * echelle
  const total = v + mod
  let critique: ResultatJet['critique'] = null
  if (demande.de === 'D20') {
    if (v === 20) critique = 'reussite'
    else if (v === 1) critique = 'echec'
  } else {
    if (v >= 96) critique = 'reussite'
    else if (v <= 5) critique = 'echec'
  }
  const reussite = critique === 'reussite' ? true : critique === 'echec' ? false : total >= demande.difficulte
  return { ...demande, valeur: v, modificateur: mod, total, reussite, critique, virtuel }
}

export function valeurValide(de: De, valeur: unknown): boolean {
  const n = typeof valeur === 'number' ? valeur : parseInt(String(valeur), 10)
  return Number.isInteger(n) && n >= 1 && n <= faces(de)
}

/** Phrase transmise au Narrateur : il raconte l'issue, il ne la décide pas. */
export function decrireResultat(r: ResultatJet, nomStat: string): string {
  const signe = r.modificateur >= 0 ? `+${r.modificateur}` : `${r.modificateur}`
  const issue = r.critique === 'reussite' ? 'RÉUSSITE CRITIQUE' : r.critique === 'echec' ? 'ÉCHEC CRITIQUE' : r.reussite ? 'RÉUSSITE' : 'ÉCHEC'
  const marge = Math.abs(r.total - r.difficulte)
  const nuance = r.critique ? '' : marge <= (r.de === 'D100' ? 10 : 2) ? ' (de justesse)' : marge >= (r.de === 'D100' ? 40 : 8) ? ' (très nettement)' : ''
  return `Jet de ${nomStat} (${r.de}) pour « ${r.motif} » : ${r.valeur} ${signe} = ${r.total} contre ${r.difficulte} → ${issue}${nuance}.`
}

export const NOMS_STATS: Record<StatId, string> = {
  force: 'Force', agilite: 'Agilité', esprit: 'Esprit', volonte: 'Volonté', charme: 'Charme', perception: 'Perception',
}

export function statsDeBase(forces: StatId[], faiblesse: StatId | null): Record<StatId, number> {
  const s = Object.fromEntries(STATS.map((k) => [k, 10])) as Record<StatId, number>
  if (forces[0]) s[forces[0]] += 4
  if (forces[1] && forces[1] !== forces[0]) s[forces[1]] += 2
  if (faiblesse && !forces.includes(faiblesse)) s[faiblesse] -= 2
  return s
}
