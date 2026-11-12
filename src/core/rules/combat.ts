/**
 * Combat au tour par tour, entièrement résolu par le code (aucun appel d'IA pendant le combat).
 * Le joueur lance le D20 de son action ; les adversaires sont lancés par le moteur.
 * Quand le combat se termine, son compte rendu est transmis au Narrateur qui raconte la suite.
 */
import type { Combat, Combattant, GameState, Notification } from '@shared/types'
import { modificateur, alea } from './des'

export type ActionCombat =
  | { type: 'attaque'; cible: string }
  | { type: 'technique'; capacite: string; cible: string }
  | { type: 'defense' }
  | { type: 'fuite' }

export function ouvrirCombat(etat: GameState, enjeu: string, ennemis: { nom: string; pv: number; attaque: number; defense: number }[], presents: string[]): Combat {
  const h = etat.hero
  const combattants: Combattant[] = [{
    id: 'heros', nom: h.prenom, camp: 'heros', pv: h.pv, pvMax: h.pvMax,
    attaque: 2 + Math.max(modificateur(h.stats.force), modificateur(h.stats.agilite)),
    defense: 10 + modificateur(h.stats.agilite), etats: [],
  }]
  // Une héroïne présente dont la Résonance atteint 25 se bat à vos côtés.
  for (const p of etat.personnages) {
    if (p.role !== 'heroine' || p.statut !== 'vivant' || p.resonance < 25) continue
    if (!presents.some((n) => n.toLowerCase().includes(p.nom.split(' ')[0].toLowerCase()))) continue
    combattants.push({ id: p.id, nom: p.nom, camp: 'allie', pv: 14, pvMax: 14, attaque: 3 + Math.floor(p.resonance / 25), defense: 12, etats: [] })
  }
  ennemis.slice(0, 4).forEach((e, i) => combattants.push({
    id: `e${i + 1}`, nom: e.nom, camp: 'ennemi',
    pv: Math.max(4, Math.min(40, Math.round(e.pv))), pvMax: Math.max(4, Math.min(40, Math.round(e.pv))),
    attaque: Math.max(0, Math.min(8, Math.round(e.attaque))), defense: Math.max(8, Math.min(18, Math.round(e.defense))), etats: [],
  }))
  return { actif: true, tour: 1, combattants, journal: [`Le combat commence : ${enjeu}`], enjeu }
}

function degats(total: number, defense: number, bonus = 0): number {
  return Math.max(1, 2 + Math.floor((total - defense) / 2) + bonus)
}

const vivants = (c: Combat, camp: Combattant['camp']) => c.combattants.filter((x) => x.camp === camp && x.pv > 0)

/**
 * Joue un tour complet : action du héros (avec le D20 fourni), puis alliées, puis adversaires.
 * `graine` rend les lancers des autres combattants reproductibles (tests, sauvegardes).
 */
export function jouerTour(source: GameState, action: ActionCombat, d20: number, graine: number): { etat: GameState; notifications: Notification[] } {
  const etat: GameState = structuredClone(source)
  const c = etat.combat
  const notes: Notification[] = []
  if (!c || !c.actif) return { etat, notifications: notes }
  const rnd = alea(graine + c.tour * 7919)
  const de = () => 1 + Math.floor(rnd() * 20)
  const heros = c.combattants.find((x) => x.camp === 'heros')!
  const log = (s: string) => c.journal.push(s)
  const jet = Math.max(1, Math.min(20, Math.round(d20)))
  let enGarde = false

  const frapper = (attaquant: Combattant, cible: Combattant, valeur: number, bonusDegats = 0, nomAttaque = 'attaque') => {
    const total = valeur + attaquant.attaque
    const garde = cible.camp === 'heros' && enGarde ? 4 : 0
    if (valeur === 1) { log(`${attaquant.nom} : ${nomAttaque} manquée de façon spectaculaire (1).`); return }
    if (valeur === 20 || total >= cible.defense + garde) {
      const d = degats(total, cible.defense + garde, bonusDegats) * (valeur === 20 ? 2 : 1)
      cible.pv = Math.max(0, cible.pv - d)
      log(`${attaquant.nom} touche ${cible.nom}${valeur === 20 ? ' — coup critique' : ''} (${valeur}+${attaquant.attaque} contre ${cible.defense + garde}) : ${d} dégâts${cible.pv === 0 ? `. ${cible.nom} est hors de combat` : ''}.`)
    } else {
      log(`${attaquant.nom} manque ${cible.nom} (${valeur}+${attaquant.attaque} contre ${cible.defense + garde}).`)
    }
  }

  // 1. Le héros
  if (action.type === 'fuite') {
    const total = jet + modificateur(etat.hero.stats.agilite)
    if (jet === 20 || (jet !== 1 && total >= 12)) {
      log(`Vous rompez le combat (${jet}+${modificateur(etat.hero.stats.agilite)}).`)
      c.actif = false
      c.issue = 'fuite'
    } else log(`Vous tentez de fuir, en vain (${total} contre 12).`)
  } else if (action.type === 'defense') {
    enGarde = true
    log('Vous vous mettez en garde (+4 en défense ce tour).')
  } else {
    const cible = c.combattants.find((x) => x.id === action.cible && x.camp === 'ennemi' && x.pv > 0) ?? vivants(c, 'ennemi')[0]
    if (cible) {
      if (action.type === 'technique') {
        const cap = etat.hero.capacites.find((k) => k.id === action.capacite)
        const cout = cap?.coutMana ?? 3
        if (!cap) log('Cette technique vous échappe.')
        else if (etat.hero.mana < cout) { log(`Mana insuffisant pour ${cap.nom} (${etat.hero.mana}/${cout}).`); notes.push({ genre: 'refus', texte: 'Mana insuffisant.' }) }
        else {
          etat.hero.mana -= cout
          const bonus = cap.source === 'resonance' ? 4 : 2
          frapper({ ...heros, attaque: heros.attaque + 2 }, cible, jet, bonus, cap.nom)
        }
      } else frapper(heros, cible, jet)
    }
  }

  // 2. Les alliées
  if (c.actif) for (const a of vivants(c, 'allie')) {
    const cible = vivants(c, 'ennemi')[0]
    if (cible) frapper(a, cible, de())
  }

  // 3. Les adversaires
  if (c.actif) for (const e of vivants(c, 'ennemi')) {
    const cibles = [...vivants(c, 'heros'), ...vivants(c, 'allie')]
    if (!cibles.length) break
    const cible = cibles[Math.floor(rnd() * cibles.length)]
    frapper(e, cible, de())
  }

  // 4. Issue
  etat.hero.pv = heros.pv
  if (c.actif) {
    if (!vivants(c, 'ennemi').length) { c.actif = false; c.issue = 'victoire'; log('Victoire.') }
    else if (heros.pv <= 0) {
      c.actif = false; c.issue = 'defaite'; log('Vous vous effondrez.')
      if (!etat.hero.etats.includes('Inconscient')) etat.hero.etats.push('Inconscient')
    } else c.tour += 1
  }
  if (!c.actif) etat.stats.combats += 1
  return { etat, notifications: notes }
}

/** Compte rendu remis au Narrateur à la fin du combat. */
export function compteRendu(c: Combat): string {
  const issue = c.issue === 'victoire' ? 'VICTOIRE du héros' : c.issue === 'defaite' ? 'DÉFAITE du héros (il perd connaissance, il n’est pas tué)' : 'le héros a FUI'
  return `[Combat résolu par les règles — ${c.enjeu} — issue : ${issue}, en ${c.tour} tour(s).]\n${c.journal.slice(-8).join('\n')}`
}
