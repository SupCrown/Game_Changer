/**
 * Assemblage du contexte envoyé au Narrateur, structuré pour le cache des prompts :
 *
 *   system  [consignes + bible fixe]                 ◄ point de cache 1 — ne change jamais
 *   user    [MÉMOIRE stable]                         ◄ point de cache 2 — change à la compaction (≈ une fois par jour de jeu)
 *   …       [scènes récentes : action / prose]       ◄ point de cache 3 — sur la dernière scène, lecture incrémentale
 *   user    [bloc volatile + action du joueur]         jamais en cache
 *
 * Invariant : rien de ce qui varie d'un tour à l'autre ne doit apparaître avant le point de cache 3.
 */
import type { GameState, Reglages } from '@shared/types'
import type { BlocSysteme, MessageIA } from '@core/ai/types'
import { bibleFixe, bourseQualitative, lienQualitatif, santeQualitative, systemeNarrateur, type Gabarit } from '@core/ai/prompts/fr'
import { estimerJetons } from '@core/ai/prose'
import { consigneCourante, dateLisible, mystereAutorise } from '@core/rules/rythme'
import { statutFaction, trouverParNom } from '@core/rules/moteur'
import type { Regles } from '@core/rules/regles'

export interface SceneContexte {
  id: string
  index: number
  jour: number
  action: string
  prose: string
}

export const BUDGETS_FENETRE: Record<Reglages['ia']['fenetre'], number> = {
  econome: 6000,
  equilibre: 24000,
  riche: 120000,
}

export function budgetFenetre(reglages: Reglages, gabarit: Gabarit): number {
  const voulu = BUDGETS_FENETRE[reglages.ia.fenetre] ?? BUDGETS_FENETRE.equilibre
  // Un modèle local n'a qu'un petit contexte : on lui réserve moins de la moitié pour l'historique.
  return gabarit === 'petit' ? Math.min(voulu, Math.floor(reglages.ia.ollamaContexte * 0.4)) : voulu
}

export const ACTION_OUVERTURE = '(Début de l’histoire.)'

function jetonsScene(s: SceneContexte): number {
  return estimerJetons(s.action) + estimerJetons(s.prose) + 8
}

/**
 * Compaction : si les scènes envoyées en entier dépassent le budget, on avance le début de la fenêtre
 * jusqu'à redescendre à 60 % du budget (hystérésis : on ne recompacte pas à chaque tour).
 * Les scènes sorties de la fenêtre restent accessibles par leurs résumés et par la recherche de souvenirs.
 * Renvoie le nouvel état de mémoire, ou null si rien ne change.
 */
export function compacter(etat: GameState, scenes: SceneContexte[], budget: number, forcer = false): { debutFenetre: number; faitsStables: number } | null {
  const debut = Math.min(etat.memoire.debutFenetre, scenes.length)
  let total = 0
  for (let i = debut; i < scenes.length; i++) total += jetonsScene(scenes[i])
  const seuil = forcer ? budget : budget * 1.25
  if (total <= seuil) {
    // À la fin d'une journée, on en profite pour stabiliser les faits récents même sans déplacer la fenêtre.
    if (forcer && etat.memoire.faitsStables !== etat.memoire.faits.length) {
      return { debutFenetre: debut, faitsStables: etat.memoire.faits.length }
    }
    return null
  }
  let nouveau = debut
  const cible = budget * 0.6
  // On garde toujours au moins les deux dernières scènes en entier.
  while (nouveau < scenes.length - 2 && total > cible) {
    total -= jetonsScene(scenes[nouveau])
    nouveau++
  }
  return { debutFenetre: nouveau, faitsStables: etat.memoire.faits.length }
}

/** Bloc de mémoire stable : ne dépend que de ce qui précède la fenêtre. */
export function blocMemoire(etat: GameState, scenes: SceneContexte[]): string {
  const m = etat.memoire
  const debut = Math.min(m.debutFenetre, scenes.length)
  const parties: string[] = ['# MÉMOIRE DE L’HISTOIRE']
  if (m.chronique) parties.push(`## Chronique\n${m.chronique}`)
  if (m.chapitres.length) parties.push(`## Chapitres précédents\n${m.chapitres.map((c) => `Chapitre ${c.chapitre} — ${c.texte}`).join('\n')}`)

  const premierJourFenetre = scenes[debut]?.jour ?? Infinity
  // Journées entièrement sorties de la fenêtre (celles d'un chapitre clos ont déjà été retirées de la liste).
  const jours = m.jours.filter((j) => j.jour < premierJourFenetre)
  if (jours.length) parties.push(`## Journées récentes\n${jours.map((j) => `Jour ${j.jour} — ${j.texte}`).join('\n')}`)

  // Scènes sorties de la fenêtre dont la journée n'a pas encore de résumé.
  const joursResumes = new Set(jours.map((j) => j.jour))
  const idsAvant = new Set(scenes.slice(0, debut).map((s) => s.id))
  const orphelines = m.scenes.filter((s) => idsAvant.has(s.sceneId) && !joursResumes.has(s.jour) && s.jour >= premierJourFenetre - 1)
  if (orphelines.length) parties.push(`## Plus tôt\n${orphelines.map((s) => `- (jour ${s.jour}) ${s.texte}`).join('\n')}`)

  const faits = m.faits.slice(0, m.faitsStables)
  if (faits.length) parties.push(`## Faits établis (à ne jamais contredire)\n${faits.map((f) => `- ${f}`).join('\n')}`)

  if (parties.length === 1) parties.push('L’histoire commence.')
  return parties.join('\n\n')
}

/** Bloc volatile : tout ce qui change d'un tour à l'autre. */
export function blocVolatile(etat: GameState, regles: Regles, p: { souvenirs: string[]; evenementDuJour?: string; resultatJet?: string; presentsRecents: string[] }): string {
  const h = etat.hero
  const lieu = etat.lieux.find((l) => l.id === etat.lieuActuel)
  const consigne = consigneCourante(etat, regles)
  const lignes: string[] = ['[CONTEXTE DE JEU — invisible pour le joueur, à ne jamais citer tel quel]']
  lignes.push(`Moment : ${dateLisible(etat.calendrier)}.${lieu ? ` Lieu actuel : ${lieu.nom}.` : ''}`)
  if (p.evenementDuJour) lignes.push(`Événement du jour : ${p.evenementDuJour}`)

  const etats = h.etats.length ? `, états : ${h.etats.join(', ')}` : ''
  const objets = h.inventaire.length ? ` Possède : ${h.inventaire.map((o) => o.nom).join(', ')}.` : ''
  lignes.push(`Héros : ${santeQualitative(h.pv, h.pvMax)}${etats} ; ${bourseQualitative(h.or)}.${objets}`)
  const caps = h.capacites.map((c) => c.nom).join(', ')
  if (caps) lignes.push(`Capacités du héros : ${caps}.`)

  const liens = etat.personnages
    .filter((x) => x.role === 'heroine' && x.rencontre && x.statut === 'vivant')
    .map((x) => `${x.nom} — ${lienQualitatif(x.resonance)}`)
  if (liens.length) lignes.push(`Liens actuels : ${liens.join(' ; ')}.`)

  const factions = etat.factions.filter((f) => statutFaction(f, regles) !== 'neutre')
    .map((f) => `${f.nom} ${statutFaction(f, regles) === 'hostile' ? 'agit contre le héros' : 'protège le héros'}`)
  if (factions.length) lignes.push(`Pression sociale : ${factions.join(' ; ')}.`)

  // Fiches vivantes des personnages probablement en scène.
  const noms = new Set([...consigne.personnages, ...p.presentsRecents])
  const vivantes: string[] = []
  for (const nom of noms) {
    const x = trouverParNom(etat.personnages, nom)
    if (!x || x.statut !== 'vivant') continue
    const bouts = [x.opinion ? `pense du héros : ${x.opinion}` : '', x.souvenirs.length ? `se souvient : ${x.souvenirs.slice(-3).join(' | ')}` : '',
      x.arc.titre && x.arc.etapes[x.arc.etape] ? `étape de son arc : ${x.arc.etapes[x.arc.etape]}` : ''].filter(Boolean)
    if (bouts.length) vivantes.push(`- ${x.nom} — ${bouts.join(' ; ')}`)
    if (vivantes.length >= 4) break
  }
  if (vivantes.length) lignes.push(`Personnages (état d'esprit) :\n${vivantes.join('\n')}`)

  const faitsRecents = etat.memoire.faits.slice(etat.memoire.faitsStables)
  if (faitsRecents.length) lignes.push(`Faits récents (à ne pas contredire) :\n${faitsRecents.map((f) => `- ${f}`).join('\n')}`)

  const promesses = etat.memoire.promesses.filter((x) => !x.tenue).slice(-5)
  if (promesses.length) lignes.push(`Promesses et rendez-vous en suspens :\n${promesses.map((x) => `- ${x.texte}`).join('\n')}`)

  const objectifs = etat.journal.filter((j) => j.type === 'objectif' && j.statut === 'actif').slice(-4)
  if (objectifs.length) lignes.push(`Objectifs du héros : ${objectifs.map((o) => o.texte).join(' ; ')}`)

  const horsChamp = etat.memoire.horsChamp.filter((x) => !x.revele).slice(-3)
  if (horsChamp.length) {
    lignes.push(`Hors champ récemment (le héros l'ignore ; n'en montre que les conséquences visibles, si l'occasion s'y prête) :\n${horsChamp.map((x) => `- ${x.personnage} : ${x.texte}`).join('\n')}`)
  }

  if (p.souvenirs.length) lignes.push(`Souvenirs retrouvés (passages anciens en rapport avec la situation) :\n${p.souvenirs.map((s) => `« ${s} »`).join('\n')}`)

  const typeTxt: Record<string, string> = {
    quotidien: 'vie quotidienne', relation: 'moment de lien avec un personnage', evenement: 'événement', mystere: 'le mystère affleure', libre: 'temps libre — suis l’initiative du joueur', combat: 'affrontement',
  }
  const autorise = consigne.type === 'mystere' && mystereAutorise(etat, regles)
  lignes.push(`Consigne de scène : ${typeTxt[consigne.type] ?? consigne.type}.${consigne.consigne ? ` ${consigne.consigne}` : ''}`)
  lignes.push(autorise
    ? 'Mystère : autorisé dans cette scène — UN seul détail concret et discret (un acte, un objet, un silence), sans explication ni réplique énigmatique.'
    : 'Mystère : INTERDIT dans cette scène. Aucune allusion, aucun sous-entendu, aucun avertissement. Si le joueur enquête, il ne trouve rien de décisif pour l’instant : des gens occupés, des portes fermées, de l’ordinaire.')
  lignes.push('L’initiative du joueur prime sur la consigne : s’il fait autre chose, suis-le.')
  if (etat.memoire.correction) lignes.push(`Correction à intégrer discrètement (sans la commenter) : ${etat.memoire.correction}`)
  if (p.resultatJet) lignes.push(`RÉSULTAT DU JET (décidé par les dés, non négociable) : ${p.resultatJet} Raconte exactement cette issue.`)
  return lignes.join('\n')
}

export interface ContexteNarrateur {
  systeme: BlocSysteme[]
  messages: MessageIA[]
}

export function construireNarrateur(p: {
  etat: GameState
  scenes: SceneContexte[]
  action: string
  reglages: Reglages
  regles: Regles
  gabarit: Gabarit
  souvenirs: string[]
  evenementDuJour?: string
  resultatJet?: string
  presentsRecents: string[]
}): ContexteNarrateur {
  const { etat, scenes, gabarit } = p
  const systeme: BlocSysteme[] = [
    { texte: `${systemeNarrateur(etat, p.reglages.ia.longueurScene, gabarit)}\n\n${bibleFixe(etat, gabarit)}`, cache: true },
  ]
  const messages: MessageIA[] = [{ role: 'user', contenu: blocMemoire(etat, scenes), cache: true }]
  const debut = Math.min(etat.memoire.debutFenetre, scenes.length)
  const fenetre = scenes.slice(debut)
  fenetre.forEach((s, i) => {
    messages.push({ role: 'user', contenu: `[ACTION DU JOUEUR]\n${s.action || ACTION_OUVERTURE}` })
    messages.push({ role: 'assistant', contenu: s.prose, cache: i === fenetre.length - 1 })
  })
  const volatile = blocVolatile(etat, p.regles, p)
  const ouverture = scenes.length === 0 && etat.monde.ouverture
    ? `\n\nC’est la toute première scène. Situation de départ : ${etat.monde.ouverture}\nPose le décor et le héros dans son quotidien, sans aucun mystère, et laisse le joueur faire son premier geste.`
    : ''
  messages.push({ role: 'user', contenu: `${volatile}${ouverture}\n\n[ACTION DU JOUEUR]\n${p.action || ACTION_OUVERTURE}` })
  return { systeme, messages }
}
