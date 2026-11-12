/**
 * Données musicales et composition générative, sans aucune dépendance à l'API Web Audio.
 * Tout ce qui est ici est pur et déterministe (à graine égale, musique égale) : testable sous Node.
 */
import type { Humeur } from '@shared/types'

export const HUMEURS: readonly Humeur[] = ['calme', 'joyeux', 'tendu', 'mystere', 'romance', 'combat', 'triste']

// ───────────────────────── Hasard à graine ─────────────────────────

/** Générateur pseudo-aléatoire (mulberry32) : renvoie des nombres dans [0, 1). */
export function creerAleatoire(graine: number): () => number {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ───────────────────────── Notes et gammes ─────────────────────────

/** Note MIDI → fréquence en hertz (la 440 = 69). */
export function midiVersFrequence(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

export const GAMMES = {
  majeur: [0, 2, 4, 5, 7, 9, 11],
  mineur: [0, 2, 3, 5, 7, 8, 10],
  dorien: [0, 2, 3, 5, 7, 9, 10],
  phrygien: [0, 1, 3, 5, 7, 8, 10],
} as const
export type NomGamme = keyof typeof GAMMES

/** Degré de la gamme (0 = tonique ; peut être négatif ou dépasser l'octave) → note MIDI. */
export function degreVersMidi(tonique: number, gamme: readonly number[], degre: number): number {
  const n = gamme.length
  const octave = Math.floor(degre / n)
  const i = ((degre % n) + n) % n
  return tonique + 12 * octave + gamme[i]
}

/** Ramène une note dans l'octave [bas, bas + 12) sans changer son nom. */
export function replier(midi: number, bas: number): number {
  return bas + ((((midi - bas) % 12) + 12) % 12)
}

/** Classe de hauteur (0..11) d'une note. */
export function classe(midi: number): number {
  return ((midi % 12) + 12) % 12
}

/** Formes d'accord, exprimées en pas de gamme au-dessus de la fondamentale. */
export const FORMES = {
  triade: [0, 2, 4],
  septieme: [0, 2, 4, 6],
  add9: [0, 2, 4, 8],
  sus2: [0, 1, 4],
  sus4: [0, 3, 4],
  /** Quinte à vide doublée à l'octave. */
  quinte: [0, 4, 7],
  /** Empilement de quartes. */
  quartes: [0, 3, 6],
} as const
export type NomForme = keyof typeof FORMES

export interface Accord {
  /** Degré de la fondamentale dans la gamme (0 = tonique). */
  degre: number
  forme: NomForme
}

// ───────────────────────── Partitions ─────────────────────────

export type TimbreMelodique = 'piano' | 'harpe' | 'cloche' | 'verre' | 'cor'
export type TimbrePercussion = 'grave' | 'caisse' | 'souffle' | 'tom' | 'pouls'
export type Timbre = TimbreMelodique | TimbrePercussion | 'nappe' | 'bourdon' | 'basse'
export type Voix = 'nappe' | 'bourdon' | 'basse' | 'arpege' | 'melodie' | 'percu'

export interface Partition {
  humeur: Humeur
  /** Tonique (note MIDI de référence, octave 4). */
  tonique: number
  gamme: NomGamme
  /** Battements par minute. */
  tempo: number
  tempsParMesure: number
  mesuresParAccord: number
  /** Plusieurs progressions, alternées au fil des phrases. */
  progressions: readonly (readonly Accord[])[]
  /** Nappe tenue : `registre` = note la plus grave possible pour la fondamentale. */
  nappe: { niveau: number; registre: number }
  /** Bourdon grave sur la tonique, quel que soit l'accord. */
  bourdon: { niveau: number; registre: number } | null
  basse: { niveau: number; registre: number; motif: 'tenue' | 'pulsee' | 'ostinato' } | null
  arpege: {
    timbre: TimbreMelodique
    niveau: number
    registre: readonly [number, number]
    /** Notes par temps. */
    parTemps: number
    /** Probabilité de sauter une note (respiration). */
    silence: number
    /** Durée de résonance d'une note, en temps. */
    tenue: number
    /** Motifs : indices dans l'échelle des notes de l'accord. */
    motifs: readonly (readonly number[])[]
    /** Probabilité que l'arpège joue pendant une phrase. */
    presence: number
  } | null
  melodie: {
    timbre: TimbreMelodique
    niveau: number
    registre: readonly [number, number]
    /** Degrés de la gamme autorisés (sous-ensemble : pentatonique, etc.). */
    degres: readonly number[]
    /** Subdivisions par temps. */
    pas: number
    /** Probabilité de base qu'une case porte une note. */
    densite: number
    /** Probabilité qu'une mesure entière reste silencieuse. */
    repos: number
    /** Tendance de la marche : négatif = descendante, positif = ascendante. */
    pente: number
  } | null
  percussion: { style: 'combat' | 'pouls' | 'leger'; niveau: number } | null
  reverb: { salle: 'moyenne' | 'vaste'; niveau: number }
  /** Coupure du filtre passe-bas appliqué à toute la couche (Hz). */
  filtre: number
}

const a = (degre: number, forme: NomForme = 'triade'): Accord => ({ degre, forme })

export const PARTITIONS: Record<Humeur, Partition> = {
  // Fa majeur, lent : harpe clairsemée, piano électrique pentatonique.
  calme: {
    humeur: 'calme',
    tonique: 65,
    gamme: 'majeur',
    tempo: 63,
    tempsParMesure: 4,
    mesuresParAccord: 2,
    progressions: [
      [a(0, 'add9'), a(5, 'septieme'), a(3, 'septieme'), a(4, 'sus4')],
      [a(0), a(2, 'septieme'), a(3, 'add9'), a(0, 'sus2')],
      [a(3, 'septieme'), a(0, 'add9'), a(1, 'septieme'), a(4, 'sus4')],
    ],
    nappe: { niveau: 0.055, registre: 46 },
    bourdon: null,
    basse: { niveau: 0.085, registre: 34, motif: 'tenue' },
    arpege: {
      timbre: 'harpe', niveau: 0.1, registre: [60, 84], parTemps: 1, silence: 0.3, tenue: 2.5,
      motifs: [[0, 2, 1, 3], [0, 1, 2, 3, 4, 3, 2, 1], [2, 1, 0, 1, 3, 2]],
      presence: 0.75,
    },
    melodie: {
      timbre: 'piano', niveau: 0.12, registre: [65, 86], degres: [0, 1, 2, 4, 5],
      pas: 2, densite: 0.2, repos: 0.4, pente: 0,
    },
    percussion: null,
    reverb: { salle: 'moyenne', niveau: 0.38 },
    filtre: 4200,
  },

  // Sol majeur, vif : harpe en croches, boîte à musique, balancement léger.
  joyeux: {
    humeur: 'joyeux',
    tonique: 67,
    gamme: 'majeur',
    tempo: 104,
    tempsParMesure: 4,
    mesuresParAccord: 1,
    progressions: [
      [a(0), a(4), a(5), a(3)],
      [a(0), a(3), a(0), a(4, 'sus4')],
      [a(5), a(3), a(0), a(4)],
      [a(0, 'add9'), a(2), a(3), a(4, 'sus4')],
    ],
    nappe: { niveau: 0.04, registre: 48 },
    bourdon: null,
    basse: { niveau: 0.09, registre: 36, motif: 'pulsee' },
    arpege: {
      timbre: 'harpe', niveau: 0.085, registre: [62, 86], parTemps: 2, silence: 0.28, tenue: 1.5,
      motifs: [[0, 1, 2, 3, 2, 1], [0, 2, 1, 3], [0, 1, 2, 3, 4, 2, 3, 1]],
      presence: 0.85,
    },
    melodie: {
      timbre: 'cloche', niveau: 0.085, registre: [67, 88], degres: [0, 1, 2, 4, 5],
      pas: 2, densite: 0.28, repos: 0.3, pente: 0,
    },
    percussion: { style: 'leger', niveau: 0.05 },
    reverb: { salle: 'moyenne', niveau: 0.28 },
    filtre: 5000,
  },

  // Ré phrygien : bourdon grave, seconde mineure, pouls sourd.
  tendu: {
    humeur: 'tendu',
    tonique: 62,
    gamme: 'phrygien',
    tempo: 56,
    tempsParMesure: 4,
    mesuresParAccord: 2,
    progressions: [
      [a(0, 'quinte'), a(1), a(0, 'sus2'), a(6)],
      [a(0, 'sus2'), a(4), a(0, 'quinte'), a(1, 'septieme')],
    ],
    nappe: { niveau: 0.045, registre: 45 },
    bourdon: { niveau: 0.085, registre: 36 },
    basse: null,
    arpege: {
      timbre: 'verre', niveau: 0.05, registre: [62, 81], parTemps: 1, silence: 0.55, tenue: 3,
      motifs: [[0, 2, 1, 3], [3, 1, 2, 0], [0, 1, 0, 2]],
      presence: 0.5,
    },
    melodie: {
      timbre: 'verre', niveau: 0.065, registre: [69, 86], degres: [0, 1, 2, 3, 4, 6],
      pas: 2, densite: 0.11, repos: 0.5, pente: 0,
    },
    percussion: { style: 'pouls', niveau: 0.15 },
    reverb: { salle: 'vaste', niveau: 0.42 },
    filtre: 2400,
  },

  // La dorien : quintes et quartes à vide, verre, réverbération longue.
  mystere: {
    humeur: 'mystere',
    tonique: 69,
    gamme: 'dorien',
    tempo: 50,
    tempsParMesure: 4,
    mesuresParAccord: 2,
    progressions: [
      [a(0, 'quinte'), a(6, 'sus2'), a(3, 'quartes'), a(0, 'sus4')],
      [a(0, 'sus2'), a(2, 'quinte'), a(3, 'sus2'), a(4, 'quinte')],
      [a(0, 'quartes'), a(6, 'quinte'), a(0, 'sus2'), a(3, 'quinte')],
    ],
    nappe: { niveau: 0.05, registre: 45 },
    bourdon: null,
    basse: { niveau: 0.065, registre: 33, motif: 'tenue' },
    arpege: {
      timbre: 'verre', niveau: 0.07, registre: [57, 84], parTemps: 1, silence: 0.5, tenue: 3,
      motifs: [[0, 2, 4, 1, 3], [0, 3, 1, 4], [4, 2, 0, 3]],
      presence: 0.8,
    },
    melodie: {
      timbre: 'cloche', niveau: 0.06, registre: [69, 88], degres: [0, 1, 2, 4, 5],
      pas: 2, densite: 0.1, repos: 0.5, pente: 0,
    },
    percussion: null,
    reverb: { salle: 'vaste', niveau: 0.6 },
    filtre: 3200,
  },

  // Mi bémol majeur à trois temps : piano électrique coulant, accords de septième.
  romance: {
    humeur: 'romance',
    tonique: 63,
    gamme: 'majeur',
    tempo: 80,
    tempsParMesure: 3,
    mesuresParAccord: 2,
    progressions: [
      [a(0, 'septieme'), a(5, 'septieme'), a(1, 'septieme'), a(4, 'sus4')],
      [a(3, 'septieme'), a(4), a(2, 'septieme'), a(5, 'add9')],
      [a(0, 'add9'), a(3, 'septieme'), a(1, 'septieme'), a(4)],
    ],
    nappe: { niveau: 0.045, registre: 46 },
    bourdon: null,
    basse: { niveau: 0.08, registre: 34, motif: 'tenue' },
    arpege: {
      timbre: 'piano', niveau: 0.09, registre: [58, 82], parTemps: 2, silence: 0.14, tenue: 2,
      motifs: [[0, 1, 2, 3, 2, 1], [0, 2, 3, 4, 3, 2], [0, 1, 3, 2, 4, 3]],
      presence: 0.9,
    },
    melodie: {
      timbre: 'cloche', niveau: 0.08, registre: [70, 89], degres: [0, 1, 2, 3, 4, 5, 6],
      pas: 2, densite: 0.2, repos: 0.3, pente: 0,
    },
    percussion: null,
    reverb: { salle: 'moyenne', niveau: 0.4 },
    filtre: 4600,
  },

  // Mi mineur, pulsé : basse en croches, percussions douces, cor clairsemé.
  combat: {
    humeur: 'combat',
    tonique: 64,
    gamme: 'mineur',
    tempo: 112,
    tempsParMesure: 4,
    mesuresParAccord: 2,
    progressions: [
      [a(0), a(5), a(6), a(0, 'sus4')],
      [a(0), a(3), a(6), a(4)],
      [a(0, 'quinte'), a(2), a(5), a(6)],
    ],
    nappe: { niveau: 0.04, registre: 45 },
    bourdon: null,
    basse: { niveau: 0.1, registre: 36, motif: 'ostinato' },
    arpege: {
      timbre: 'harpe', niveau: 0.06, registre: [59, 79], parTemps: 2, silence: 0.3, tenue: 1,
      motifs: [[0, 2, 1, 2], [0, 1, 2, 1, 3, 1, 2, 1], [3, 2, 1, 0]],
      presence: 0.5,
    },
    melodie: {
      timbre: 'cor', niveau: 0.085, registre: [64, 81], degres: [0, 2, 3, 4, 6],
      pas: 2, densite: 0.17, repos: 0.35, pente: 0,
    },
    percussion: { style: 'combat', niveau: 0.2 },
    reverb: { salle: 'moyenne', niveau: 0.22 },
    filtre: 3800,
  },

  // Ré mineur, très lent : piano électrique descendant, cor lointain.
  triste: {
    humeur: 'triste',
    tonique: 62,
    gamme: 'mineur',
    tempo: 52,
    tempsParMesure: 4,
    mesuresParAccord: 2,
    progressions: [
      [a(0), a(5, 'septieme'), a(3), a(4)],
      [a(0, 'add9'), a(3, 'septieme'), a(6), a(2)],
      [a(5), a(3), a(0, 'sus2'), a(4)],
    ],
    nappe: { niveau: 0.055, registre: 45 },
    bourdon: null,
    basse: { niveau: 0.075, registre: 33, motif: 'tenue' },
    arpege: {
      timbre: 'piano', niveau: 0.085, registre: [57, 79], parTemps: 1, silence: 0.35, tenue: 3,
      motifs: [[3, 2, 1, 0], [4, 2, 3, 1], [2, 1, 0, 1]],
      presence: 0.8,
    },
    melodie: {
      timbre: 'cor', niveau: 0.055, registre: [62, 81], degres: [0, 1, 2, 3, 4, 5, 6],
      pas: 1, densite: 0.24, repos: 0.45, pente: -0.15,
    },
    percussion: null,
    reverb: { salle: 'vaste', niveau: 0.45 },
    filtre: 3000,
  },
}

// ───────────────────────── Accords et échelles ─────────────────────────

/** Notes de l'accord en position fondamentale, à partir de la tonique de la partition. */
export function notesAccord(p: Partition, accord: Accord): number[] {
  const gamme = GAMMES[p.gamme]
  return FORMES[accord.forme].map(pas => degreVersMidi(p.tonique, gamme, accord.degre + pas))
}

/**
 * Disposition ouverte pour la nappe : fondamentale dans [registre, registre + 12),
 * deuxième note montée d'une octave (évite les frottements serrés dans le grave).
 */
export function dispositionNappe(p: Partition, accord: Accord): number[] {
  const notes = notesAccord(p, accord)
  const decalage = replier(notes[0], p.nappe.registre) - notes[0]
  return notes.map((n, i) => n + decalage + (i === 1 ? 12 : 0)).sort((x, y) => x - y)
}

/** Toutes les notes de [bas, haut] appartenant aux classes de hauteur données, en ordre croissant. */
export function echelleAccord(classes: ReadonlySet<number>, bas: number, haut: number): number[] {
  const sortie: number[] = []
  for (let m = bas; m <= haut; m++) if (classes.has(classe(m))) sortie.push(m)
  return sortie
}

/** Notes autorisées pour la mélodie d'une partition, en ordre croissant. */
export function echelleMelodie(p: Partition): number[] {
  if (!p.melodie) return []
  const gamme = GAMMES[p.gamme]
  const classes = new Set(p.melodie.degres.map(d => classe(p.tonique + gamme[d])))
  return echelleAccord(classes, p.melodie.registre[0], p.melodie.registre[1])
}

// ───────────────────────── Composition ─────────────────────────

export interface NoteEvt {
  voix: Voix
  timbre: Timbre
  /** Début, en temps depuis le début de la mesure. */
  temps: number
  /** Durée, en temps. */
  duree: number
  /** Note MIDI (0 pour les percussions, qui n'ont pas de hauteur). */
  midi: number
  /** Amplitude de crête, 0..1 (niveau de la voix déjà appliqué). */
  velocite: number
}

export interface Mesure {
  index: number
  accord: Accord
  /** Longueur de la mesure, en temps. */
  temps: number
  /** Notes triées par début croissant. */
  notes: NoteEvt[]
}

/**
 * Compose la musique mesure par mesure. La forme varie d'une phrase à l'autre :
 * progression, motif d'arpège, présence de la mélodie, intensité.
 */
export class Compositeur {
  private readonly alea: () => number
  private readonly echelle: number[]
  private mesure = 0
  private phrase = 0
  private posPhrase = 0
  private iProgression = 0
  private intensite = 1
  private arpegeActif = true
  private melodieActive = true
  private percuPleine = true
  private motifArpege: readonly number[] = [0]
  private posArpege = 0
  private iMelodie: number
  private motif: { debuts: number[]; pas: number[] } | null = null

  constructor(readonly partition: Partition, graine: number) {
    this.alea = creerAleatoire(graine)
    this.echelle = echelleMelodie(partition)
    this.iMelodie = Math.floor(this.echelle.length / 2)
  }

  mesureSuivante(): Mesure {
    const p = this.partition
    if (this.posPhrase === 0) this.nouvellePhrase()
    const progression = p.progressions[this.iProgression]
    const longueur = progression.length * p.mesuresParAccord
    const accord = progression[Math.floor(this.posPhrase / p.mesuresParAccord)]
    const debutAccord = this.posPhrase % p.mesuresParAccord === 0
    const finPhrase = this.posPhrase === longueur - 1
    const classes = new Set(notesAccord(p, accord).map(classe))

    const notes: NoteEvt[] = []
    if (debutAccord) {
      this.ecrireNappe(notes, accord)
      this.ecrireBourdon(notes)
      this.posArpege = 0
    }
    this.ecrireBasse(notes, accord, debutAccord)
    this.ecrireArpege(notes, classes)
    this.ecrireMelodie(notes, classes, finPhrase)
    this.ecrirePercussion(notes, finPhrase)
    notes.sort((x, y) => x.temps - y.temps)

    const index = this.mesure++
    this.posPhrase = (this.posPhrase + 1) % longueur
    return { index, accord, temps: p.tempsParMesure, notes }
  }

  private nouvellePhrase(): void {
    const p = this.partition
    const n = p.progressions.length
    if (this.phrase > 0 && n > 1 && this.alea() < 0.6) {
      let i = Math.floor(this.alea() * (n - 1))
      if (i >= this.iProgression) i++
      this.iProgression = i
    }
    this.intensite = 0.75 + 0.25 * this.alea()
    if (p.arpege) {
      this.arpegeActif = this.alea() < p.arpege.presence
      this.motifArpege = p.arpege.motifs[Math.floor(this.alea() * p.arpege.motifs.length)]
    } else {
      this.arpegeActif = false
    }
    // Jamais de phrase sans arpège ni mélodie quand la partition a une mélodie.
    const tirage = this.alea()
    this.melodieActive = p.melodie !== null && (tirage < 0.8 || !this.arpegeActif)
    this.percuPleine = this.alea() < 0.7
    this.phrase++
  }

  /** Petit décalage (en temps) pour éviter une régularité mécanique. */
  private flou(amplitude: number): number {
    return (this.alea() - 0.5) * 2 * amplitude
  }

  private ecrireNappe(notes: NoteEvt[], accord: Accord): void {
    const p = this.partition
    const duree = p.tempsParMesure * p.mesuresParAccord
    dispositionNappe(p, accord).forEach((midi, i) => {
      const poids = i === 0 ? 1 : 0.85
      notes.push({
        voix: 'nappe', timbre: 'nappe', temps: 0, duree, midi,
        velocite: p.nappe.niveau * poids * (0.85 + 0.15 * this.intensite),
      })
    })
  }

  private ecrireBourdon(notes: NoteEvt[]): void {
    const p = this.partition
    if (!p.bourdon) return
    const duree = p.tempsParMesure * p.mesuresParAccord
    const base = replier(p.tonique, p.bourdon.registre)
    const couches: [number, number][] = [[0, 1], [7, 0.6], [12, 0.45]]
    for (const [intervalle, poids] of couches) {
      notes.push({
        voix: 'bourdon', timbre: 'bourdon', temps: 0, duree,
        midi: base + intervalle, velocite: p.bourdon.niveau * poids,
      })
    }
  }

  private ecrireBasse(notes: NoteEvt[], accord: Accord, debutAccord: boolean): void {
    const p = this.partition
    const b = p.basse
    if (!b) return
    const gamme = GAMMES[p.gamme]
    const racine = replier(degreVersMidi(p.tonique, gamme, accord.degre), b.registre)
    const quinte = replier(degreVersMidi(p.tonique, gamme, accord.degre + 4), racine)
    const T = p.tempsParMesure
    const note = (temps: number, duree: number, midi: number, poids: number): void => {
      notes.push({ voix: 'basse', timbre: 'basse', temps, duree, midi, velocite: b.niveau * poids })
    }

    if (b.motif === 'tenue') {
      // Fondamentale à chaque mesure ; parfois la quinte quand l'accord se prolonge.
      const surQuinte = !debutAccord && this.alea() < 0.35
      note(0, T, surQuinte ? quinte : racine, surQuinte ? 0.8 : 1)
    } else if (b.motif === 'pulsee') {
      note(0, T / 2 - 0.5, racine, 1)
      note(T / 2, T / 2 - 0.5, this.alea() < 0.8 ? quinte : racine, 0.8)
      if (this.alea() < 0.2) note(T - 0.5, 0.4, racine, 0.6)
    } else {
      // Ostinato en croches ; allégé en noires dans les phrases calmes.
      for (let s = 0; s < T * 2; s++) {
        const contretemps = s % 2 === 1
        if (contretemps && !this.percuPleine) continue
        if (s > 0 && this.alea() < (contretemps ? 0.3 : 0.05)) continue
        const cran = s % 8
        const midi = cran === 3 || cran === 7 ? quinte : cran === 6 ? racine + 12 : racine
        note(s / 2, 0.42, midi, contretemps ? 0.7 : 1)
      }
    }
  }

  private ecrireArpege(notes: NoteEvt[], classes: ReadonlySet<number>): void {
    const p = this.partition
    const arp = p.arpege
    if (!arp || !this.arpegeActif) return
    const echelle = echelleAccord(classes, arp.registre[0], arp.registre[1])
    if (echelle.length === 0) return
    const cases = p.tempsParMesure * arp.parTemps
    for (let s = 0; s < cases; s++) {
      const k = this.posArpege++
      if (s > 0 && this.alea() < arp.silence) continue
      const surTemps = s % arp.parTemps === 0
      const midi = echelle[this.motifArpege[k % this.motifArpege.length] % echelle.length]
      notes.push({
        voix: 'arpege', timbre: arp.timbre,
        temps: s / arp.parTemps + (s > 0 ? Math.abs(this.flou(0.012)) : 0),
        duree: arp.tenue, midi,
        velocite: arp.niveau * this.intensite * (surTemps ? 1 : 0.8) * (0.85 + 0.15 * this.alea()),
      })
    }
  }

  /** Marche aléatoire contrainte : petits pas, rappel vers le centre du registre. */
  private tirerPas(pente: number): number {
    const r = this.alea()
    let pas = r < 0.14 ? -2 : r < 0.46 ? -1 : r < 0.54 ? 0 : r < 0.86 ? 1 : 2
    if (pente !== 0 && this.alea() < Math.abs(pente)) pas = Math.sign(pente) * Math.abs(pas)
    const centre = (this.echelle.length - 1) / 2
    const ecart = (this.iMelodie - centre) / Math.max(1, centre)
    if (this.alea() < Math.abs(ecart) * 0.8) pas = -Math.sign(ecart) * Math.abs(pas)
    return pas
  }

  /**
   * Indice voisin (au plus un cran) tombant sur une note de l'accord, sinon l'indice inchangé.
   * On cherche d'abord dans le sens du mouvement, pour ne pas retomber sur la note précédente.
   */
  private versNoteAccord(indice: number, classes: ReadonlySet<number>, sens: number): number {
    const avant = sens < 0 ? -1 : 1
    for (const d of [0, avant, -avant]) {
      const j = indice + d
      if (j >= 0 && j < this.echelle.length && classes.has(classe(this.echelle[j]))) return j
    }
    return indice
  }

  private ecrireMelodie(notes: NoteEvt[], classes: ReadonlySet<number>, finPhrase: boolean): void {
    const p = this.partition
    const m = p.melodie
    if (!m || !this.melodieActive || this.echelle.length === 0) return
    // Entrée en douceur : la mélodie attend la fin du premier accord.
    if (this.mesure < p.mesuresParAccord) return
    if (this.alea() < m.repos) return

    const cases = p.tempsParMesure * m.pas
    let debuts: number[]
    let pasMemoire: number[] | null = null
    if (this.motif && this.alea() < 0.35) {
      // Reprise du dernier motif : c'est ce qui donne un air de mélodie plutôt que du hasard.
      debuts = this.motif.debuts
      pasMemoire = this.motif.pas
    } else {
      debuts = []
      for (let s = 0; s < cases; s++) {
        const surTemps = s % m.pas === 0
        const proba = m.densite * this.intensite * (surTemps ? 1.5 : 0.7) * (s === 0 ? 1.2 : 1)
        if (this.alea() < proba) debuts.push(s)
      }
    }
    if (debuts.length === 0) return

    const pasJoues: number[] = []
    debuts.forEach((s, i) => {
      const dernier = i === debuts.length - 1
      const surTemps = s % m.pas === 0
      const pas = pasMemoire ? pasMemoire[i] : this.tirerPas(m.pente)
      pasJoues.push(pas)
      let indice = Math.min(this.echelle.length - 1, Math.max(0, this.iMelodie + pas))
      if ((finPhrase && dernier) || (surTemps && this.alea() < 0.5)) indice = this.versNoteAccord(indice, classes, pas)
      this.iMelodie = indice
      const suivant = dernier ? cases : debuts[i + 1]
      const duree = Math.max(0.5, Math.min((suivant - s) / m.pas, finPhrase && dernier ? 3 : 2.5))
      notes.push({
        voix: 'melodie', timbre: m.timbre,
        temps: s / m.pas + (s > 0 ? Math.abs(this.flou(0.015)) : 0),
        duree, midi: this.echelle[indice],
        velocite: m.niveau * (surTemps ? 1 : 0.85) * (0.8 + 0.2 * this.alea()),
      })
    })
    this.motif = { debuts, pas: pasJoues }
  }

  private ecrirePercussion(notes: NoteEvt[], finPhrase: boolean): void {
    const p = this.partition
    const perc = p.percussion
    if (!perc) return
    const T = p.tempsParMesure
    const coup = (timbre: TimbrePercussion, temps: number, poids: number): void => {
      notes.push({ voix: 'percu', timbre, temps, duree: 0.25, midi: 0, velocite: perc.niveau * poids })
    }

    if (perc.style === 'pouls') {
      // Battement de cœur lent : deux coups rapprochés.
      const battements = this.percuPleine ? [0, T / 2] : [0]
      for (const t of battements) {
        coup('pouls', t, 1)
        coup('pouls', t + 0.38, 0.6)
      }
    } else if (perc.style === 'leger') {
      if (!this.percuPleine) return
      for (let s = 0; s < T * 2; s++) {
        const contretemps = s % 2 === 1
        if (contretemps) {
          if (this.alea() < 0.5) coup('souffle', s / 2, 0.5)
        } else if (s % 4 === 2) {
          coup('souffle', s / 2, 1)
        }
      }
    } else {
      for (let s = 0; s < T * 2; s++) {
        const contretemps = s % 2 === 1
        const t = s / 2
        if (s % 4 === 0) coup('grave', t, 1)
        else if (this.percuPleine && (s === 3 || s === 7) && this.alea() < 0.2) coup('grave', t, 0.55)
        if (!this.percuPleine) {
          if (contretemps && this.alea() < 0.5) coup('souffle', t, 0.16)
          continue
        }
        if (s % 4 === 2) coup('caisse', t, 0.42)
        if (this.alea() < 0.85) coup('souffle', t, contretemps ? 0.26 : 0.17)
        if (finPhrase && s >= T * 2 - 2) coup('tom', t, 0.55)
      }
    }
  }
}
