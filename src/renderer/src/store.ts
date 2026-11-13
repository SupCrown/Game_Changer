/**
 * État de l'interface. L'interface n'est qu'un reflet : elle envoie des intentions au processus principal
 * et se met à jour à partir des événements qu'il émet. Elle ne calcule jamais l'état du jeu.
 */
import { create } from 'zustand'
import type {
  BilanCouts, DemandeJet, ErreurIA, EvenementTour, GameState, Humeur, Ligne, Notification, PartieResume, Phase, Reglages, ResultatJet,
} from '@shared/types'
import { REGLAGES_DEFAUT } from '@shared/types'
import type { Initial, Instantane, Pont } from '@shared/ipc'

declare global {
  interface Window { resonance: Pont; __essai?: Record<string, (...a: any[]) => unknown> }
}

export const api = () => window.resonance

export interface SceneVue { action: string; lignes: Ligne[]; jour?: number }
export type Ecran = 'titre' | 'nouvelle' | 'jeu'
export type Panneau =
  | 'fiche' | 'liens' | 'factions' | 'journal' | 'enquete' | 'codex' | 'emploi' | 'relations' | 'sauvegardes' | 'galerie' | 'succes'
  | 'couts' | 'reglages' | 'dev' | 'historique'

interface Jeu {
  pret: boolean
  initial: Initial | null
  reglages: Reglages
  parties: PartieResume[]
  ecran: Ecran
  etat: GameState | null
  scenes: SceneVue[]
  /** Index de la ligne affichée dans la scène courante (-1 : rien encore). */
  curseur: number
  /** Le joueur a rattrapé le Narrateur et lit le texte au fil de l'écriture. */
  suitDirect: boolean
  enDirect: string
  narrationFinie: boolean
  actionEnAttente: string
  brouillon: string
  phase: Phase
  generationImage: boolean
  creation: boolean
  notifications: (Notification & { id: number })[]
  erreur: ErreurIA | null
  jet: DemandeJet | null
  resultatJet: ResultatJet | null
  transition: { titre: string; sousTitre?: string; id: number } | null
  ambiance: { humeur: Humeur; effet: string | null; meteo: string | null; id: number }
  images: Record<string, string>
  panneau: Panneau | null
  bilan: BilanCouts | null
  rapportManquant: boolean
  epilogue: string

  demarrer(): Promise<void>
  aller(ecran: Ecran): void
  ouvrirPanneau(p: Panneau | null): void
  majReglages(r: Reglages): Promise<void>
  charger(i: Instantane): void
  ouvrirPartie(id: string): Promise<void>
  quitterPartie(): Promise<void>
  jouer(texte: string, activite?: string): void
  avancer(): void
  toutAfficher(): void
  fermerErreur(): void
  retirerNotification(id: number): void
  image(cle: string): string | undefined
  demanderImage(cle: string): void
  recevoir(e: EvenementTour): void
}

let compteur = 0
const demandes = new Set<string>()

export const useJeu = create<Jeu>((set, get) => ({
  pret: false,
  initial: null,
  reglages: REGLAGES_DEFAUT,
  parties: [],
  ecran: 'titre',
  etat: null,
  scenes: [],
  curseur: -1,
  suitDirect: false,
  enDirect: '',
  narrationFinie: true,
  actionEnAttente: '',
  brouillon: '',
  phase: 'repos',
  generationImage: false,
  creation: false,
  notifications: [],
  erreur: null,
  jet: null,
  resultatJet: null,
  transition: null,
  ambiance: { humeur: 'calme', effet: null, meteo: null, id: 0 },
  images: {},
  panneau: null,
  bilan: null,
  rapportManquant: false,
  epilogue: '',

  async demarrer() {
    const initial = await api().app.initial()
    api().surEvenement((e) => get().recevoir(e))
    set({ pret: true, initial, reglages: initial.reglages, parties: initial.parties })
  },

  aller(ecran) {
    set({ ecran, panneau: null })
  },

  ouvrirPanneau(panneau) {
    set({ panneau })
  },

  async majReglages(r) {
    set({ reglages: r })
    const confirme = await api().reglages.ecrire(r)
    set({ reglages: confirme })
  },

  charger(i) {
    demandes.clear()
    const scenes: SceneVue[] = i.historique.map((s) => ({ action: s.action, lignes: s.lignes, jour: s.jour }))
    const derniere = scenes[scenes.length - 1]
    set({
      etat: i.etat, scenes, curseur: derniere ? derniere.lignes.length - 1 : -1, narrationFinie: true, suitDirect: false, enDirect: '',
      jet: i.etat.jetEnAttente, resultatJet: null, bilan: i.bilan, rapportManquant: i.rapportManquant, images: {}, erreur: null,
      epilogue: i.etat.epilogue ?? '', phase: 'repos', ecran: 'jeu', panneau: null, notifications: [],
    })
  },

  async ouvrirPartie(id) {
    const i = await api().parties.ouvrir(id)
    get().charger(i)
    if (i.historique.length === 0) void api().jeu.commencer()
  },

  async quitterPartie() {
    await api().parties.fermer()
    const parties = await api().parties.lister()
    set({ ecran: 'titre', etat: null, scenes: [], parties, panneau: null, jet: null, erreur: null })
  },

  jouer(texte, activite) {
    const action = texte.trim()
    if (!action || get().phase !== 'repos') return
    set({ actionEnAttente: action, brouillon: '', erreur: null, resultatJet: null })
    void api().jeu.jouer(action, activite)
  },

  avancer() {
    const { scenes, curseur, narrationFinie, enDirect } = get()
    const lignes = scenes[scenes.length - 1]?.lignes ?? []
    if (curseur < lignes.length - 1) set({ curseur: curseur + 1 })
    else if (!narrationFinie && enDirect) set({ suitDirect: true })
  },

  toutAfficher() {
    const lignes = get().scenes[get().scenes.length - 1]?.lignes ?? []
    set({ curseur: lignes.length - 1, suitDirect: !get().narrationFinie })
  },

  fermerErreur() {
    set({ erreur: null })
  },

  retirerNotification(id) {
    set({ notifications: get().notifications.filter((n) => n.id !== id) })
  },

  image(cle) {
    return get().images[cle]
  },

  demanderImage(cle) {
    if (demandes.has(cle) || get().images[cle] || !get().etat) return
    demandes.add(cle)
    api().images.obtenir(cle).then((r) => {
      if (r) set({ images: { ...get().images, [cle]: r.url } })
    }).catch(() => demandes.delete(cle))
  },

  recevoir(e) {
    const s = get()
    switch (e.type) {
      case 'phase': {
        if (e.phase === 'image') return set({ generationImage: true })
        if (e.phase === 'repos' && e.detail === 'image') return set({ generationImage: false })
        if (e.phase === 'narration') {
          // Une nouvelle scène commence : elle s'ajoute à l'historique et devient la scène affichée.
          set({
            phase: e.phase, scenes: [...s.scenes, { action: s.actionEnAttente, lignes: [], jour: s.etat?.calendrier.jour }],
            curseur: -1, narrationFinie: false, suitDirect: false, enDirect: '', actionEnAttente: '',
          })
          return
        }
        if (e.phase === 'epilogue') return set({ phase: e.phase, epilogue: '' })
        return set({ phase: e.phase })
      }
      case 'ligne': {
        const scenes = [...s.scenes]
        const derniere = scenes[scenes.length - 1]
        if (!derniere) return
        scenes[scenes.length - 1] = { ...derniere, lignes: [...derniere.lignes, e.ligne] }
        const index = derniere.lignes.length
        set({ scenes, curseur: s.curseur === -1 || s.suitDirect ? index : s.curseur, enDirect: '' })
        return
      }
      case 'delta':
        if (s.phase === 'epilogue') return set({ epilogue: e.texte })
        return set({ enDirect: e.texte })
      case 'scene-finie':
        return set({ narrationFinie: true, suitDirect: false, enDirect: '', rapportManquant: false })
      case 'etat':
        return set({ etat: e.etat, jet: e.etat.jetEnAttente, epilogue: e.etat.epilogue ?? s.epilogue })
      case 'notifications':
        return set({ notifications: [...s.notifications, ...e.liste.map((n) => ({ ...n, id: ++compteur }))].slice(-5) })
      case 'jet':
        return set({ jet: e.demande })
      case 'jet-resultat':
        return set({ resultatJet: e.resultat, actionEnAttente: '🎲' })
      case 'image':
        return set({ images: { ...s.images, [e.cle]: e.url } })
      case 'ambiance':
        return set({ ambiance: { humeur: e.humeur, effet: e.effet ?? null, meteo: e.meteo ?? null, id: ++compteur } })
      case 'transition':
        return set({ transition: { titre: e.titre, sousTitre: e.sousTitre, id: ++compteur } })
      case 'cout': {
        // Alerte quand la dépense franchit 80 % d'un plafond.
        const franchit = (avant: number, apres: number, plafond: number) => plafond > 0 && avant < plafond * 0.8 && apres >= plafond * 0.8
        const b = e.bilan
        const alerte = s.reglages.couts.alerte && s.bilan
          && (franchit(s.bilan.session, b.session, b.plafondSession) || franchit(s.bilan.partie, b.partie, b.plafondPartie))
        return set({
          bilan: b,
          notifications: alerte
            ? [...s.notifications, { id: ++compteur, genre: 'refus' as const, texte: 'Vous avez dépensé 80 % d’un plafond de coût (Menu › Coûts).' }]
            : s.notifications,
        })
      }
      case 'erreur': {
        if (e.erreur.genre === 'annule') return
        // Si la narration a échoué en cours de route, la scène inachevée disparaît et le texte du joueur lui est rendu.
        if (!s.narrationFinie) {
          const scenes = s.scenes.slice(0, -1)
          const abandonnee = s.scenes[s.scenes.length - 1]
          const precedente = scenes[scenes.length - 1]
          set({
            scenes, narrationFinie: true, suitDirect: false, enDirect: '', curseur: precedente ? precedente.lignes.length - 1 : -1,
            brouillon: abandonnee && abandonnee.action !== '🎲' ? abandonnee.action : '', erreur: e.erreur,
          })
        } else {
          set({ erreur: e.erreur, brouillon: s.actionEnAttente && s.actionEnAttente !== '🎲' ? s.actionEnAttente : s.brouillon, actionEnAttente: '' })
        }
        void api().jeu.instantane().then((i) => set({ rapportManquant: i.rapportManquant })).catch(() => {})
        return
      }
    }
  },
}))
