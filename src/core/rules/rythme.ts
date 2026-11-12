/**
 * Rythme du récit, garanti par le code (leçon n°1 du prototype).
 * Le Metteur en scène propose un type de scène ; ce module décide si le mystère est permis.
 */
import type { GameState, Rythme, TypeScene, Calendrier, Creneau, Lumiere, PlanJour, ConsigneCreneau } from '@shared/types'
import { CRENEAUX } from '@shared/types'
import type { Regles } from './regles'

export function configRythme(etat: Pick<GameState, 'preferences'>, regles: Regles) {
  return regles.rythme[etat.preferences.rythmeMystere] ?? regles.rythme.normal
}

export function rythmeInitial(etat: Pick<GameState, 'preferences'>, regles: Regles): Rythme {
  return { chapitre: 1, indicesRestants: configRythme(etat, regles).indicesParChapitre, scenesDepuisIndice: 0, totalScenes: 0, tension: 1 }
}

export function mystereAutorise(etat: Pick<GameState, 'preferences' | 'rythme'>, regles: Regles): boolean {
  const cfg = configRythme(etat, regles)
  const r = etat.rythme
  return r.totalScenes >= cfg.debutSansMystere && r.indicesRestants > 0 && r.scenesDepuisIndice >= cfg.ecartMin
}

/** Le type réellement joué : un « mystère » non autorisé redevient du quotidien. */
export function typeEffectif(propose: TypeScene, etat: Pick<GameState, 'preferences' | 'rythme'>, regles: Regles): TypeScene {
  if (propose === 'mystere' && !mystereAutorise(etat, regles)) return 'quotidien'
  return propose
}

export function apresScene(r: Rythme, indiceRevele: boolean): Rythme {
  const suite: Rythme = { ...r, totalScenes: r.totalScenes + 1 }
  if (indiceRevele) {
    // Un indice lâché hors budget met le compteur en dette : la prochaine révélation attendra plus longtemps.
    suite.indicesRestants = Math.max(-2, r.indicesRestants - 1)
    suite.scenesDepuisIndice = 0
  } else {
    suite.scenesDepuisIndice = r.scenesDepuisIndice + 1
  }
  return suite
}

export function nouveauChapitre(r: Rythme, etat: Pick<GameState, 'preferences'>, regles: Regles): Rythme {
  const cfg = configRythme(etat, regles)
  return { ...r, chapitre: r.chapitre + 1, indicesRestants: Math.min(cfg.indicesParChapitre, r.indicesRestants + cfg.indicesParChapitre) }
}

// ───────────────────────── Calendrier ─────────────────────────

export function creneauDe(c: Calendrier): Creneau {
  return CRENEAUX[Math.max(0, Math.min(CRENEAUX.length - 1, c.creneau))]
}

export function lumiereDe(c: Calendrier): Lumiere {
  const cr = creneauDe(c)
  return cr === 'soir' ? 'crepuscule' : cr === 'nuit' ? 'nuit' : 'jour'
}

export const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
export const NOMS_CRENEAUX: Record<Creneau, string> = { matin: 'Matin', midi: 'Midi', 'apres-midi': 'Après-midi', soir: 'Soir', nuit: 'Nuit' }

export function dateLisible(c: Calendrier): string {
  const semaine = Math.floor((c.jour - 1) / 7) + 1
  return `${JOURS_SEMAINE[(c.jour - 1) % 7]} · Jour ${c.jour} · Semaine ${semaine} · ${NOMS_CRENEAUX[creneauDe(c)]}`
}

export function estJourDeRepos(jour: number): boolean {
  return (jour - 1) % 7 >= 5
}

export interface Avancee {
  calendrier: Calendrier
  nouveauCreneau: boolean
  nouveauJour: boolean
  nouveauChapitre: boolean
}

/** Une scène vient de se terminer : le temps avance-t-il ? */
export function avancer(c: Calendrier, finCreneau: boolean, regles: Regles): Avancee {
  const scenes = c.scenesDansCreneau + 1
  if (!finCreneau && scenes < regles.calendrier.scenesMaxParCreneau) {
    return { calendrier: { ...c, scenesDansCreneau: scenes }, nouveauCreneau: false, nouveauJour: false, nouveauChapitre: false }
  }
  return creneauSuivant(c, regles)
}

export function creneauSuivant(c: Calendrier, regles: Regles): Avancee {
  if (c.creneau + 1 < CRENEAUX.length) {
    return { calendrier: { jour: c.jour, creneau: c.creneau + 1, scenesDansCreneau: 0 }, nouveauCreneau: true, nouveauJour: false, nouveauChapitre: false }
  }
  const jour = c.jour + 1
  return {
    calendrier: { jour, creneau: 0, scenesDansCreneau: 0 },
    nouveauCreneau: true,
    nouveauJour: true,
    nouveauChapitre: (jour - 1) % regles.calendrier.joursParChapitre === 0,
  }
}

export function jourSuivant(c: Calendrier, regles: Regles): Avancee {
  const jour = c.jour + 1
  return {
    calendrier: { jour, creneau: 0, scenesDansCreneau: 0 },
    nouveauCreneau: true,
    nouveauJour: true,
    nouveauChapitre: (jour - 1) % regles.calendrier.joursParChapitre === 0,
  }
}

/** Consigne du créneau courant, avec le type plafonné par le budget de mystère. */
export function consigneCourante(etat: GameState, regles: Regles): ConsigneCreneau {
  const cr = creneauDe(etat.calendrier)
  const prevue = etat.plan?.jour === etat.calendrier.jour ? etat.plan.consignes.find((c) => c.creneau === cr) : undefined
  const base: ConsigneCreneau = prevue ?? { creneau: cr, type: 'quotidien', consigne: '', personnages: [] }
  return { ...base, type: typeEffectif(base.type, etat, regles) }
}

/** Plan par défaut quand le Metteur en scène n'a pas (encore) parlé : du quotidien, rien d'autre. */
export function planParDefaut(jour: number, emploi: Partial<Record<Creneau, string>>): PlanJour {
  const repos = estJourDeRepos(jour)
  return {
    jour,
    intention: repos ? 'Une journée libre : laisser le héros choisir.' : 'Une journée ordinaire : installer le quotidien et les relations.',
    consignes: CRENEAUX.map((creneau) => ({
      creneau,
      type: creneau === 'soir' || repos ? 'libre' : 'quotidien',
      consigne: repos ? 'Temps libre.' : (emploi[creneau] ?? ''),
      personnages: [],
    })),
  }
}
