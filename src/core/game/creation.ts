/** Création d'une partie : préférences du joueur + monde généré → état initial du jeu. */
import type { Creneau, Faction, GameState, Lieu, Personnage, Preferences, StatId } from '@shared/types'
import type { MondeGenere } from '@core/ai/schemas'
import { sansAccents } from '@core/ai/schemas'
import { grainede, statsDeBase } from '@core/rules/des'
import { identifiant } from '@core/rules/moteur'
import { rythmeInitial, planParDefaut } from '@core/rules/rythme'
import type { Regles } from '@core/rules/regles'

export interface PackUnivers {
  id: string
  nom: string
  accroche: string
  description: string
  theme: string
  premisse: string
  cadre: string
  factions: string[]
  archetypes: string[]
  styleImage: string
  tons: string[]
  emploiDuTemps: Partial<Record<Creneau, string>>
  evenements: { jour: number; nom: string; description: string }[]
}

export interface EntreeHeros {
  prenom: string
  age: number
  forces: StatId[]
  faiblesse: StatId | null
}

export const PREFERENCES_DEFAUT: Preferences = {
  univers: 'fantasy',
  ton: 'léger et malicieux, avec de vrais moments de tension',
  style: 'anime',
  premisse: '',
  envies: '',
  refus: '',
  romance: true,
  violence: 'moderee',
  difficulte: 'normale',
  rythmeMystere: 'lent',
}

const COULEURS = ['#e8b4bc', '#9ec5e8', '#c9b3ec', '#f0c987', '#a8dcc0', '#f2a488', '#b9c2d6', '#d8a7d0', '#8fd0d6', '#e3d18a']

export function validerHeros(h: EntreeHeros): EntreeHeros {
  const prenom = h.prenom.replace(/[\[\]{}<>|]/g, '').trim().slice(0, 24) || 'Aubin'
  const age = Math.max(18, Math.min(60, Math.round(Number(h.age) || 19)))
  return { prenom, age, forces: h.forces.slice(0, 2), faiblesse: h.faiblesse }
}

export function construireEtat(p: {
  id: string
  preferences: Preferences
  heros: EntreeHeros
  monde: MondeGenere
  univers?: PackUnivers
  regles: Regles
}): GameState {
  const h = validerHeros(p.heros)
  const m = p.monde
  const stats = statsDeBase(h.forces, h.faiblesse)
  const pvMax = 16 + Math.max(0, Math.floor((stats.force - 10) / 2)) * 2
  const manaMax = 8 + Math.max(0, Math.floor((stats.esprit - 10) / 2)) * 2

  const personnages: Personnage[] = []
  m.personnages.forEach((x, i) => {
    personnages.push({
      id: identifiant('p', x.nom, personnages),
      nom: x.nom, role: x.role, age: Math.max(18, x.age), archetype: x.archetype, description: x.description,
      apparence: x.apparence, personnalite: x.personnalite, voix: x.voix, objectifs: x.objectifs, secrets: x.secrets,
      arc: { titre: x.arcTitre, etapes: x.arcEtapes, etape: 0 }, opinion: x.opinion, souvenirs: [], resonance: 0,
      paliers: x.role === 'heroine' ? completerPaliers(x.paliers, x.nom) : [],
      paliersDebloques: [], rivales: [], statut: 'vivant', rencontre: false,
      couleur: COULEURS[i % COULEURS.length], graine: grainede(`${p.id}:${x.nom}`), moments: [],
    })
  })
  // Les rivalités sont données par nom : on les convertit en identifiants, dans les deux sens.
  m.personnages.forEach((x, i) => {
    for (const nom of x.rivales) {
      const r = personnages.find((q) => sansAccents(q.nom) === sansAccents(nom) || sansAccents(q.nom).startsWith(sansAccents(nom).split(' ')[0]))
      if (!r || r === personnages[i] || r.role !== 'heroine' || personnages[i].role !== 'heroine') continue
      if (!personnages[i].rivales.includes(r.id)) personnages[i].rivales.push(r.id)
      if (!r.rivales.includes(personnages[i].id)) r.rivales.push(personnages[i].id)
    }
  })

  const lieux: Lieu[] = []
  for (const l of m.lieux) lieux.push({ id: identifiant('l', l.nom, lieux), nom: l.nom, description: l.description, type: l.type, decouvert: false })
  const factions: Faction[] = []
  for (const f of m.factions.slice(0, 4)) {
    factions.push({ id: identifiant('f', f.nom, factions), nom: f.nom, description: f.description, reputation: Math.max(-40, Math.min(20, Math.round(f.reputation))) })
  }

  const etat: GameState = {
    version: 1,
    id: p.id,
    hero: {
      prenom: h.prenom, age: h.age, apparence: m.heros.apparence, pv: pvMax, pvMax, mana: manaMax, manaMax, stats,
      capacites: [{ id: 'cap-base', nom: m.heros.capacite.nom, description: m.heros.capacite.description, source: 'base', coutMana: 3 }],
      etats: [], inventaire: m.heros.objets.map((o) => ({ nom: o.nom, description: o.description, quantite: 1 })), or: m.heros.or,
    },
    monde: {
      nom: m.monde.nom, univers: p.univers?.nom ?? p.preferences.univers, ton: p.preferences.ton, style: p.preferences.style,
      description: m.monde.description, cadre: m.monde.cadre, regles: m.monde.regles, veriteCachee: m.monde.veriteCachee,
      actes: m.monde.actes, premisse: p.preferences.premisse || p.univers?.premisse || '', ouverture: m.ouverture,
      theme: p.univers?.theme ?? 'libre', titre: m.titre,
    },
    preferences: p.preferences,
    personnages,
    factions,
    lieux,
    lieuActuel: lieux[0]?.id ?? '',
    journal: m.objectifInitial ? [{ id: 'j1', type: 'objectif', texte: m.objectifInitial, statut: 'actif', jour: 1 }] : [],
    hypotheses: [],
    codex: [
      { id: 'c1', categorie: 'monde', titre: m.monde.nom, texte: m.monde.description, jour: 1 },
      ...(m.monde.cadre ? [{ id: 'c2', categorie: 'lieu' as const, titre: 'Le cadre', texte: m.monde.cadre, jour: 1 }] : []),
    ],
    calendrier: { jour: 1, creneau: 0, scenesDansCreneau: 0 },
    plan: planParDefaut(1, p.univers?.emploiDuTemps ?? {}),
    rythme: rythmeInitial({ preferences: p.preferences }, p.regles),
    memoire: { chronique: '', chapitres: [], jours: [], scenes: [], faits: [], promesses: [], horsChamp: [], debutFenetre: 0, faitsStables: 0 },
    jetEnAttente: null,
    dernierJet: null,
    combat: null,
    pistes: [],
    succes: [],
    stats: { scenes: 0, jets: 0, jetsReussis: 0, critiques: 0, combats: 0, deductionsJustes: 0, motsEcrits: 0 },
    galerie: [],
    entrainement: {},
    finProposee: false,
    termine: false,
  }
  return etat
}

/** Garantit quatre paliers (25/50/75/100), même si l'IA en a oublié. */
function completerPaliers(recus: { seuil: number; nom: string; description: string }[], nom: string) {
  const prenom = nom.split(' ')[0]
  const defauts: Record<number, { nom: string; description: string }> = {
    25: { nom: `Présence de ${prenom}`, description: 'Sa confiance vous porte : un léger avantage quand elle est à vos côtés.' },
    50: { nom: `Accord avec ${prenom}`, description: 'Une technique que vous ne pouvez exécuter qu’ensemble.' },
    75: { nom: `Parole de ${prenom}`, description: 'Elle engage son nom et son influence pour vous.' },
    100: { nom: `Résonance parfaite — ${prenom}`, description: 'Un pouvoir unique né de votre lien.' },
  }
  return ([25, 50, 75, 100] as const).map((seuil) => {
    const r = recus.find((x) => x.seuil === seuil)
    return { seuil, nom: r?.nom || defauts[seuil].nom, description: r?.description || defauts[seuil].description }
  })
}

// ───────────────────────── Succès ─────────────────────────

export interface DefSucces { id: string; nom: string; description: string; test: (e: GameState) => boolean }

export const SUCCES: DefSucces[] = [
  { id: 'premiers-pas', nom: 'Premiers pas', description: 'Jouer sa première scène.', test: (e) => e.stats.scenes >= 1 },
  { id: 'une-semaine', nom: 'Une semaine entière', description: 'Atteindre le huitième jour.', test: (e) => e.calendrier.jour >= 8 },
  { id: 'un-mois', nom: 'Les habitudes', description: 'Atteindre le trentième jour.', test: (e) => e.calendrier.jour >= 30 },
  { id: 'coup-d-eclat', nom: 'Coup d’éclat', description: 'Obtenir une réussite critique.', test: (e) => e.dernierJet?.critique === 'reussite' },
  { id: 'la-poisse', nom: 'La poisse', description: 'Obtenir un échec critique. Ça arrive aux meilleurs.', test: (e) => e.dernierJet?.critique === 'echec' },
  { id: 'premier-lien', nom: 'Premier lien', description: 'Atteindre 25 de Résonance avec une héroïne.', test: (e) => e.personnages.some((p) => p.resonance >= 25) },
  { id: 'complice', nom: 'Complices', description: 'Atteindre 50 de Résonance avec une héroïne.', test: (e) => e.personnages.some((p) => p.resonance >= 50) },
  { id: 'resonance-parfaite', nom: 'Résonance parfaite', description: 'Atteindre 100 de Résonance avec une héroïne.', test: (e) => e.personnages.some((p) => p.resonance >= 100) },
  { id: 'coeurs-multiples', nom: 'Équilibriste', description: 'Atteindre 50 de Résonance avec trois héroïnes à la fois.', test: (e) => e.personnages.filter((p) => p.resonance >= 50).length >= 3 },
  { id: 'protege', nom: 'Sous protection', description: 'Gagner la protection d’une faction.', test: (e) => e.factions.some((f) => f.reputation >= 50) },
  { id: 'indesirable', nom: 'Indésirable', description: 'Devenir l’ennemi d’une faction.', test: (e) => e.factions.some((f) => f.reputation <= -50) },
  { id: 'fin-limier', nom: 'Fin limier', description: 'Formuler une déduction juste.', test: (e) => e.stats.deductionsJustes >= 1 },
  { id: 'premier-sang', nom: 'Baptême du feu', description: 'Terminer un combat.', test: (e) => e.stats.combats >= 1 },
  { id: 'erudit', nom: 'Érudit', description: 'Remplir vingt entrées du codex.', test: (e) => e.codex.length >= 20 },
  { id: 'plume', nom: 'Belle plume', description: 'Écrire plus de deux mille mots d’actions.', test: (e) => e.stats.motsEcrits >= 2000 },
  { id: 'collectionneur', nom: 'Souvenirs', description: 'Débloquer trois illustrations.', test: (e) => e.galerie.length >= 3 },
  { id: 'epilogue', nom: 'Le mot de la fin', description: 'Mener une histoire jusqu’à son épilogue.', test: (e) => e.termine },
]

/** Identifiants des succès nouvellement obtenus. */
export function nouveauxSucces(etat: GameState): DefSucces[] {
  return SUCCES.filter((s) => !etat.succes.includes(s.id) && s.test(etat))
}
