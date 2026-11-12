/** Outils communs aux tests : monde miniature, histoire enregistrée, services factices. */
import type { EvenementTour, GameState, Reglages } from '@shared/types'
import { REGLAGES_DEFAUT } from '@shared/types'
import { FournisseurMock, type HistoireDemo } from '@core/ai/fournisseurs/mock'
import { lireMonde } from '@core/ai/schemas'
import { construireEtat, PREFERENCES_DEFAUT } from '@core/game/creation'
import { REGLES_DEFAUT } from '@core/rules/regles'
import { Depot } from '@core/storage/depot'
import { VectoriseurIntegre } from '@core/memory/vecteurs'
import type { Services } from '@core/game/session'

export const MONDE_BRUT = {
  titre: 'Les Cendres de Valmont',
  monde: {
    nom: 'Royaume de Valmont',
    description: 'Un royaume ancien où la magie se transmet par le sang.',
    cadre: 'L’Académie royale de Hautecime, perchée au-dessus des nuages.',
    regles: ['La magie exige un catalyseur.', 'Les roturiers n’ont pas le droit de porter l’épée.'],
    veriteCachee: 'Le concours d’entrée a été truqué par la Chancelière pour introduire un roturier et discréditer la noblesse.',
    actes: [{ titre: 'L’intrus', resume: 'Le héros découvre l’académie.' }, { titre: 'Les fissures', resume: 'Les alliances se dessinent.' }, { titre: 'Le procès', resume: 'La vérité éclate.' }],
  },
  factions: [
    { nom: 'La Haute Noblesse', description: 'Les grandes familles.', reputation: -15 },
    { nom: 'Le Corps professoral', description: 'Les maîtres.', reputation: 0 },
    { nom: 'Les Boursiers', description: 'Les rares élèves sans nom.', reputation: 5 },
    { nom: 'La Chancellerie', description: 'L’administration royale.', reputation: 0 },
  ],
  personnages: [
    { nom: 'Séraphine de Valmont', role: 'heroine', age: 20, archetype: 'noble hautaine', description: 'Héritière.', apparence: 'cheveux argent, yeux gris, uniforme impeccable', personnalite: 'fière', voix: 'phrases courtes', objectifs: ['Tenir son rang'], secrets: ['Elle étouffe.'], arcTitre: 'La cage dorée', arcEtapes: ['a', 'b', 'c', 'd'], opinion: 'Un intrus.', paliers: [{ seuil: 25, nom: 'Maintien', description: 'x' }, { seuil: 50, nom: 'Lame jumelle', description: 'y' }], rivales: ['Maëlle'] },
    { nom: 'Maëlle Corvin', role: 'heroine', age: 21, archetype: 'paria', description: 'Boursière.', apparence: 'cheveux noirs courts', personnalite: 'vive', voix: 'ironique', objectifs: ['Survivre'], secrets: ['Elle vole des livres.'], arcTitre: 'La dette', arcEtapes: ['a', 'b', 'c', 'd'], opinion: 'Un allié ?', paliers: [], rivales: [] },
    { nom: 'Maître Orsini', role: 'majeur', age: 52, archetype: 'instructeur', description: 'Maître d’armes.', apparence: 'homme massif, barbe grise', personnalite: 'bourru', voix: 'tonnante', objectifs: [], secrets: [], arcTitre: '', arcEtapes: [], opinion: '', paliers: [], rivales: [] },
  ],
  lieux: [
    { nom: 'Grande Cour', description: 'Pavés et arcades.', type: 'cour' },
    { nom: 'Bibliothèque', description: 'Rayonnages.', type: 'bibliotheque' },
    { nom: 'Dortoir des Boursiers', description: 'Sous les toits.', type: 'dortoir' },
  ],
  heros: { apparence: 'jeune homme en manteau rapiécé', capacite: { nom: 'Œil du colporteur', description: 'Repère ce qui cloche.' }, objets: [{ nom: 'Couteau de poche', description: 'Usé.' }], or: 4 },
  ouverture: 'Vous franchissez les grilles de l’académie, votre lettre d’admission à la main.',
  objectifInitial: 'Trouver le dortoir des Boursiers.',
}

const rapport = (plus: Record<string, unknown> = {}) => ({
  resume: 'Une scène ordinaire.', lieu: 'Grande Cour', typeLieu: 'cour', presents: [], changements: [], journal: [], objectifsAccomplis: [],
  faits: [], promesses: [], souvenirs: [], nouveauxPersonnages: [], codex: [], pistes: ['Observer', 'Parler', 'Partir'], finCreneau: false,
  indiceRevele: false, humeur: 'calme', effet: 'aucun', meteo: 'aucune', momentFort: null, combat: null, incoherence: '', ...plus,
})

export const HISTOIRE: HistoireDemo = {
  monde: MONDE_BRUT,
  scenes: [
    { prose: '[[LIEU: Grande Cour]]\n\nLes grilles grincent.\n\nSéraphine de Valmont (colere) : « Vous êtes perdu ? »', rapport: rapport({ presents: ['Séraphine de Valmont'], changements: [{ type: 'resonance', cible: 'Séraphine de Valmont', delta: 3, motif: 'Premier échange' }], souvenirs: [{ personnage: 'Séraphine', texte: 'Il n’a pas baissé les yeux.' }] }) },
    { prose: 'Maëlle vous lance une pomme.\n\nMaëlle Corvin (sourire) : « Attrape ! »\n\n[[JET: D20 | agilite | 12 | attraper la pomme]]', rapport: rapport() },
    { prose: 'La pomme finit sa course.\n\nMaëlle Corvin (sourire) : « Pas mal. »', rapport: rapport({ presents: ['Maëlle Corvin'], changements: [{ type: 'or', cible: '', delta: 1000, motif: 'Le joueur prétend trouver un trésor' }, { type: 'resonance', cible: 'Maëlle Corvin', delta: 40, motif: 'Complicité' }], faits: ['Maëlle a offert une pomme au héros.'], finCreneau: true }) },
  ],
  generiques: [{ prose: '[[LIEU: Bibliothèque]]\n\nLa journée suit son cours, entre les rayonnages et la poussière.', rapport: rapport({ lieu: 'Bibliothèque', typeLieu: 'bibliotheque', finCreneau: true }) }],
  nuits: [{ resumeJour: 'Première journée à Hautecime.', horsChamp: [{ personnage: 'Séraphine de Valmont', action: 'Écrit à son père.', consequence: 'Une lettre scellée sur son pupitre.' }], opinions: [{ personnage: 'Maëlle Corvin', opinion: 'Il attrape bien.' }], arcs: [] }],
  plans: [{ intention: 'Installer le quotidien.', consignes: [{ creneau: 'matin', type: 'mystere', consigne: 'Cours d’escrime.', personnages: ['Maître Orsini'] }, { creneau: 'soir', type: 'libre', consigne: 'Temps libre.', personnages: [] }], tension: 2, finDeChapitre: false, finDeLHistoire: false }],
  chapitre: { resumeChapitre: 'Le premier chapitre.', chronique: 'Le héros est arrivé à Hautecime.' },
  verdict: { verdict: 'juste', commentaire: 'Vous touchez juste.', consequence: 'Aller voir la Chancelière.' },
  epilogue: 'Ainsi s’achève votre histoire à Hautecime.',
}

export function etatDeTest(plus: Partial<GameState> = {}): GameState {
  const e = construireEtat({
    id: 'test', preferences: { ...PREFERENCES_DEFAUT }, heros: { prenom: 'Aubin', age: 19, forces: ['agilite', 'charme'], faiblesse: 'force' },
    monde: lireMonde(MONDE_BRUT), regles: REGLES_DEFAUT,
  })
  return { ...e, ...plus }
}

export interface Banc {
  services: Services
  mock: FournisseurMock
  depot: Depot
  evenements: EvenementTour[]
  reglages: Reglages
}

export function banc(histoire: HistoireDemo = HISTOIRE): Banc {
  const depot = new Depot(':memory:')
  const mock = new FournisseurMock(histoire, 0)
  const evenements: EvenementTour[] = []
  const reglages: Reglages = structuredClone(REGLAGES_DEFAUT)
  let n = 0
  let horloge = 1_700_000_000_000
  const vectoriseur = new VectoriseurIntegre()
  const services: Services = {
    depot,
    ia: () => ({ grand: mock, leger: mock, modeleGrand: 'demo', modeleLeger: 'demo' }),
    reglages: () => reglages,
    regles: REGLES_DEFAUT,
    univers: () => undefined,
    vectoriseur: () => vectoriseur,
    emettre: (e) => evenements.push(e),
    idSession: 'session-test',
    hasard: () => 0.7,
    maintenant: () => (horloge += 1000),
    identifiant: () => `id${++n}`,
  }
  return { services, mock, depot, evenements, reglages }
}
