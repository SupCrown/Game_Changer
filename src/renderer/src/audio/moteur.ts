/**
 * Moteur audio procédural : musique d'ambiance adaptative et effets sonores,
 * entièrement synthétisés avec l'API Web Audio (aucun fichier audio).
 *
 * Chaîne du signal :
 *   couche (une par humeur) ─┬─────────────► busMusique ─► porte (pause) ─┐
 *                            └─► réverbération ─► busMusique              ├─► maître ─► limiteur ─► sortie
 *   effets ─┬───────────────────► busEffets ──────────────────────────────┘
 *           └─► réverbération courte ─► busEffets
 */
import type { Humeur } from '@shared/types'
import {
  Compositeur,
  PARTITIONS,
  creerAleatoire,
  midiVersFrequence,
  type NoteEvt,
  type Partition,
} from './partitions'

export type NomEffet =
  | 'clic' | 'page' | 'notification' | 'palier' | 'de-roule' | 'de-reussite' | 'de-echec'
  | 'critique' | 'transition' | 'coup' | 'erreur' | 'succes'

// ───────────────────────── Réglages ─────────────────────────

/** Période de la boucle d'anticipation. */
const INTERVALLE_MS = 100
/** Avance de planification minimale (s) ; allongée si le minuteur est ralenti. */
const HORIZON = 0.5
const HORIZON_MAX = 2.5
/** Durée du fondu enchaîné entre deux humeurs (s). */
const FONDU = 3
/** Gains des deux bus à volume maximal. */
const NIVEAU_MUSIQUE = 2
const NIVEAU_EFFETS = 1.2
/**
 * Compense le gain d'appoint que Chromium applique d'office dans son compresseur
 * (×1,48 mesuré avec les réglages ci-dessous) : sous le seuil, le limiteur est transparent.
 */
const GAIN_APRES_LIMITEUR = 0.68
/** Une enveloppe exponentielle est considérée éteinte après ce nombre de constantes de temps (−52 dB). */
const EXTINCTION = 6

// ───────────────────────── Logique pure (testable sans Web Audio) ─────────────────────────

export function borner01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0
}

/** Volume du curseur (0..1) → gain : courbe douce, plus proche de la perception qu'une droite. */
export function gainDepuisVolume(volume: number): number {
  return borner01(volume) ** 1.3
}

/**
 * Réponse impulsionnelle de réverbération : bruit stéréo à décroissance exponentielle (−60 dB à la fin),
 * de plus en plus sourd avec le temps, comme dans une vraie salle.
 */
export function calculerReponseImpulsionnelle(
  frequenceEchantillonnage: number,
  duree: number,
  graine: number,
): [Float32Array, Float32Array] {
  const n = Math.max(1, Math.floor(frequenceEchantillonnage * duree))
  const montee = Math.max(1, Math.floor(frequenceEchantillonnage * 0.004))
  const canal = (g: number): Float32Array => {
    const alea = creerAleatoire(g)
    const donnees = new Float32Array(n)
    let y = 0
    for (let i = 0; i < n; i++) {
      const x = i / n
      // Passe-bas à un pôle dont la coupure descend au fil de la queue.
      y += (0.7 - 0.6 * x) * (alea() * 2 - 1 - y)
      donnees[i] = y * Math.exp(-6.9 * x) * Math.min(1, i / montee)
    }
    return donnees
  }
  return [canal(graine), canal(graine + 7919)]
}

/** Instants (s) et forces (0..1) des petits chocs d'un dé qui roule : irréguliers, de plus en plus faibles. */
export function instantsRebonds(graine: number, duree = 0.8): { t: number; force: number }[] {
  const alea = creerAleatoire(graine)
  const chocs: { t: number; force: number }[] = []
  let t = 0
  while (t < duree) {
    chocs.push({ t, force: (0.45 + 0.55 * alea()) * (1 - 0.5 * (t / duree)) })
    t += 0.04 + 0.09 * alea()
  }
  return chocs
}

/** Placement stéréo stable d'une note : étale les voix sans les faire bouger. */
export function panDepuisMidi(midi: number): number {
  return (((midi * 7) % 12) / 11 - 0.5) * 0.7
}

// ───────────────────────── Synthèse ─────────────────────────

/** Une note en cours : ses sources (arrêtées ensemble) et tous ses nœuds à libérer. */
interface VoixActive {
  sources: AudioScheduledSourceNode[]
  noeuds: AudioNode[]
}

function debrancher(noeud: AudioNode): void {
  try {
    noeud.disconnect()
  } catch {
    /* déjà débranché */
  }
}

function libererVoix(ensemble: Set<VoixActive>, voix: VoixActive): void {
  if (!ensemble.delete(voix)) return
  for (const s of voix.sources) {
    s.onended = null
    debrancher(s)
  }
  for (const n of voix.noeuds) debrancher(n)
}

function couperVoix(ensemble: Set<VoixActive>, voix: VoixActive): void {
  for (const s of voix.sources) {
    try {
      s.stop()
    } catch {
      /* déjà arrêtée */
    }
  }
  libererVoix(ensemble, voix)
}

/** Repart de la valeur actuelle du paramètre : aucune marche, donc aucun clic. */
function ancrer(param: AudioParam, t: number): void {
  const valeur = param.value
  param.cancelScheduledValues(t)
  param.setValueAtTime(valeur, t)
}

function rampe(param: AudioParam, cible: number, t: number, duree: number): void {
  ancrer(param, t)
  param.linearRampToValueAtTime(cible, t + duree)
}

function viser(param: AudioParam, cible: number, t: number, constante: number): void {
  ancrer(param, t)
  param.setTargetAtTime(cible, t, constante)
}

interface OptionsTenue {
  types: OscillatorType[]
  /**
   * Poids de chaque oscillateur (1 par défaut). Des poids inégaux gardent le battement du désaccord
   * léger : à poids égaux, deux oscillateurs désaccordés s'annulent périodiquement.
   */
  poids?: number[]
  /** Désaccord total réparti entre les oscillateurs (centièmes de demi-ton, ±). */
  desaccord: number
  attaque: number
  relache: number
  /** Niveau de tenue (fraction de la crête) atteint après l'attaque. */
  soutien?: number
  declin?: number
  /** Coupure d'un filtre passe-bas propre à la note (Hz). */
  coupure?: number
  pan?: number
}

interface Partiel {
  type: OscillatorType
  ratio: number
  gain: number
  /** Constante de temps de la décroissance (s). */
  tc: number
}

interface OptionsFrappe {
  attaque: number
  pan?: number
  /** Filtre passe-bas qui se referme après l'attaque. */
  filtre?: { debut: number; fin: number; tc: number }
  /** Étouffement anticipé (fin de note). */
  tRelache?: number
  relache?: number
}

interface OptionsFm {
  indice: number
  tcIndice: number
  attaque: number
  tc: number
  tRelache?: number
  relache?: number
  pan?: number
}

interface OptionsTambour {
  de: number
  a: number
  glisse: number
  attaque: number
  tc: number
}

interface OptionsBruit {
  type: BiquadFilterType
  freq: number
  freqFin?: number
  q: number
  attaque: number
  /** Palier à la crête avant la décroissance (s). */
  palier?: number
  tc: number
}

/** Briques de synthèse. Chaque note a une enveloppe complète et se libère seule à la fin. */
class Synthe {
  constructor(
    private readonly ctx: AudioContext,
    private readonly bruitBlanc: AudioBuffer,
  ) {}

  private cible(dest: AudioNode, pan: number | undefined, noeuds: AudioNode[]): AudioNode {
    if (!pan) return dest
    const p = this.ctx.createStereoPanner()
    p.pan.value = pan
    p.connect(dest)
    noeuds.push(p)
    return p
  }

  private passeBas(coupure: number): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = coupure
    f.Q.value = -3
    return f
  }

  /** Arrête toutes les sources au même instant et libère les nœuds quand c'est fait. */
  private enregistrer(ensemble: Set<VoixActive>, sources: AudioScheduledSourceNode[], noeuds: AudioNode[], tFin: number): void {
    const voix: VoixActive = { sources, noeuds }
    ensemble.add(voix)
    sources[0].onended = () => libererVoix(ensemble, voix)
    for (const s of sources) s.stop(tFin)
  }

  /** Enveloppe percussive : montée linéaire, décroissance exponentielle, étouffement éventuel. Renvoie l'instant d'extinction. */
  private enveloppeFrappe(
    g: AudioParam, crete: number, t: number, attaque: number, tc: number, tRelache?: number, relache?: number,
  ): number {
    const tCrete = t + attaque
    g.setValueAtTime(0, t)
    g.linearRampToValueAtTime(crete, tCrete)
    g.setTargetAtTime(0, tCrete, tc)
    let fin = tCrete + tc * EXTINCTION
    if (tRelache !== undefined && relache !== undefined && tRelache > tCrete && tRelache < fin) {
      const tcFin = Math.min(tc, relache)
      g.setTargetAtTime(0, tRelache, tcFin)
      fin = Math.min(fin, tRelache + tcFin * EXTINCTION)
    }
    return fin
  }

  /** Son tenu (nappe, bourdon, basse, cor) : oscillateurs légèrement désaccordés, attaque et relâche douces. */
  tenue(ensemble: Set<VoixActive>, dest: AudioNode, f: number, crete: number, t: number, d: number, o: OptionsTenue): void {
    const ctx = this.ctx
    const noeuds: AudioNode[] = []
    const sources: AudioScheduledSourceNode[] = []
    const env = ctx.createGain()
    env.gain.value = 0
    env.connect(this.cible(dest, o.pan, noeuds))
    noeuds.push(env)
    let entree: AudioNode = env
    if (o.coupure) {
      const filtre = this.passeBas(o.coupure)
      filtre.connect(env)
      noeuds.push(filtre)
      entree = filtre
    }
    const n = o.types.length
    let poidsTotal = 0
    o.types.forEach((type, i) => {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = f
      osc.detune.value = n > 1 ? o.desaccord * ((i / (n - 1)) * 2 - 1) : 0
      const poids = o.poids?.[i] ?? 1
      poidsTotal += poids
      if (poids === 1) {
        osc.connect(entree)
      } else {
        const dose = ctx.createGain()
        dose.gain.value = poids
        osc.connect(dose)
        dose.connect(entree)
        noeuds.push(dose)
      }
      osc.start(t)
      sources.push(osc)
    })
    const g = env.gain
    const crete1 = crete / poidsTotal
    const tCrete = t + o.attaque
    g.setValueAtTime(0, t)
    g.linearRampToValueAtTime(crete1, tCrete)
    if (o.soutien !== undefined) g.setTargetAtTime(crete1 * o.soutien, tCrete, o.declin ?? 0.4)
    const tRelache = Math.max(tCrete, t + d)
    g.setTargetAtTime(0, tRelache, o.relache)
    this.enregistrer(ensemble, sources, noeuds, tRelache + o.relache * EXTINCTION)
  }

  /** Son frappé ou pincé (harpe, cloche, verre) : partiels à décroissances indépendantes. */
  frappe(ensemble: Set<VoixActive>, dest: AudioNode, f: number, crete: number, t: number, partiels: Partiel[], o: OptionsFrappe): void {
    const ctx = this.ctx
    const noeuds: AudioNode[] = []
    const sources: AudioScheduledSourceNode[] = []
    let entree = this.cible(dest, o.pan, noeuds)
    if (o.filtre) {
      const filtre = this.passeBas(o.filtre.debut)
      filtre.frequency.setValueAtTime(o.filtre.debut, t)
      filtre.frequency.setTargetAtTime(o.filtre.fin, t, o.filtre.tc)
      filtre.connect(entree)
      noeuds.push(filtre)
      entree = filtre
    }
    let tFin = t
    for (const p of partiels) {
      const fp = f * p.ratio
      // Pas de partiel dans l'extrême aigu : c'est là que naît le côté strident.
      if (fp > 6000) continue
      const osc = ctx.createOscillator()
      osc.type = p.type
      osc.frequency.value = fp
      const g = ctx.createGain()
      g.gain.value = 0
      osc.connect(g)
      g.connect(entree)
      tFin = Math.max(tFin, this.enveloppeFrappe(g.gain, crete * p.gain, t, o.attaque, p.tc, o.tRelache, o.relache))
      osc.start(t)
      sources.push(osc)
      noeuds.push(g)
    }
    if (sources.length === 0) {
      noeuds.forEach(debrancher)
      return
    }
    this.enregistrer(ensemble, sources, noeuds, tFin)
  }

  /** Piano électrique : modulation de fréquence dont l'indice retombe vite (attaque claire, tenue ronde). */
  fm(ensemble: Set<VoixActive>, dest: AudioNode, f: number, crete: number, t: number, o: OptionsFm): void {
    const ctx = this.ctx
    const noeuds: AudioNode[] = []
    const porteuse = ctx.createOscillator()
    porteuse.frequency.value = f
    const modulante = ctx.createOscillator()
    modulante.frequency.value = f
    const profondeur = ctx.createGain()
    profondeur.gain.setValueAtTime(f * o.indice, t)
    profondeur.gain.setTargetAtTime(f * o.indice * 0.12, t, o.tcIndice)
    modulante.connect(profondeur)
    profondeur.connect(porteuse.frequency)
    const env = ctx.createGain()
    env.gain.value = 0
    porteuse.connect(env)
    env.connect(this.cible(dest, o.pan, noeuds))
    noeuds.push(profondeur, env)
    const tFin = this.enveloppeFrappe(env.gain, crete, t, o.attaque, o.tc, o.tRelache, o.relache)
    porteuse.start(t)
    modulante.start(t)
    this.enregistrer(ensemble, [porteuse, modulante], noeuds, tFin)
  }

  /** Percussion grave : sinus dont la hauteur chute. */
  tambour(ensemble: Set<VoixActive>, dest: AudioNode, t: number, crete: number, o: OptionsTambour): void {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(o.de, t)
    osc.frequency.exponentialRampToValueAtTime(o.a, t + o.glisse)
    const env = ctx.createGain()
    env.gain.value = 0
    osc.connect(env)
    env.connect(dest)
    const tFin = this.enveloppeFrappe(env.gain, crete, t, o.attaque, o.tc)
    osc.start(t)
    this.enregistrer(ensemble, [osc], [env], Math.max(tFin, t + o.glisse))
  }

  /** Bruit filtré : souffles, frottements, petits chocs. */
  bruit(ensemble: Set<VoixActive>, dest: AudioNode, t: number, crete: number, o: OptionsBruit): void {
    const ctx = this.ctx
    const source = ctx.createBufferSource()
    source.buffer = this.bruitBlanc
    source.loop = true
    const filtre = ctx.createBiquadFilter()
    filtre.type = o.type
    filtre.Q.value = o.q
    filtre.frequency.setValueAtTime(o.freq, t)
    const palier = o.palier ?? 0
    const tCrete = t + o.attaque
    const tFin = tCrete + palier + o.tc * EXTINCTION
    if (o.freqFin !== undefined) filtre.frequency.exponentialRampToValueAtTime(o.freqFin, tCrete + palier + o.tc * 3)
    const env = ctx.createGain()
    env.gain.value = 0
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(crete, tCrete)
    env.gain.setTargetAtTime(0, tCrete + palier, o.tc)
    source.connect(filtre)
    filtre.connect(env)
    env.connect(dest)
    source.start(t, Math.random() * Math.max(0, this.bruitBlanc.duration - 0.1))
    this.enregistrer(ensemble, [source], [filtre, env], tFin)
  }
}

// Partiels des timbres frappés.
const PARTIELS_CLOCHE = (tc: number): Partiel[] => [
  { type: 'sine', ratio: 1, gain: 1, tc },
  { type: 'sine', ratio: 2, gain: 0.28, tc: tc * 0.45 },
  { type: 'sine', ratio: 3, gain: 0.08, tc: tc * 0.2 },
]
const PARTIELS_VERRE: Partiel[] = [
  { type: 'sine', ratio: 1, gain: 0.65, tc: 1.6 },
  { type: 'sine', ratio: 1.003, gain: 0.35, tc: 1.6 },
  { type: 'sine', ratio: 2.76, gain: 0.1, tc: 0.5 },
]
const PARTIELS_HARPE = (tc: number): Partiel[] => [
  { type: 'triangle', ratio: 1, gain: 1, tc },
  { type: 'sine', ratio: 2, gain: 0.18, tc: tc * 0.5 },
]

const entre = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x))

// ───────────────────────── Couches musicales ─────────────────────────

/** Une humeur en train de jouer (ou de s'éteindre pendant un fondu enchaîné). */
interface Couche {
  humeur: Humeur
  partition: Partition
  compositeur: Compositeur
  secParTemps: number
  entree: GainNode
  filtreNappe: BiquadFilterNode
  lfo: OscillatorNode
  lfoGain: GainNode
  filtre: BiquadFilterNode
  sortie: GainNode
  envoi: GainNode
  /** Notes de la mesure en cours, pas encore planifiées. */
  file: NoteEvt[]
  index: number
  debutMesure: number
  tMesureSuivante: number
  /** Instant (horloge audio) où la couche sortante peut être détruite ; null si elle est active. */
  finFondu: number | null
  voix: Set<VoixActive>
}

interface Reverb {
  entree: BiquadFilterNode
  convolution: ConvolverNode
}

type ConstructeurContexte = new () => AudioContext

export class MoteurAudio {
  private ctx: AudioContext | null = null
  private synthe: Synthe | null = null
  private maitre: GainNode | null = null
  private busMusique: GainNode | null = null
  private porte: GainNode | null = null
  private busEffets: GainNode | null = null
  private entreeEffets: GainNode | null = null
  private reverbs: Record<'moyenne' | 'vaste', Reverb> | null = null

  private couches: Couche[] = []
  private readonly voixEffets = new Set<VoixActive>()
  private readonly derniersEffets = new Map<NomEffet, number>()

  private humeur: Humeur | null = null
  private volumes = { musique: 0.35, effets: 0.5 }
  private enPause = false
  private minuterie: ReturnType<typeof setInterval> | null = null
  private minuteriePause: ReturnType<typeof setTimeout> | null = null
  private dernierTic = 0
  private graine = 0

  /** Ne crée PAS l'AudioContext ici (politique d'autoplay) : seulement à `demarrer()`. */
  constructor() {
    // Volontairement vide.
  }

  /** À appeler après un geste de l'utilisateur. Idempotent. */
  demarrer(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.enPause) void this.ctx.resume().catch(() => undefined)
      return
    }
    const portee = globalThis as unknown as { AudioContext?: ConstructeurContexte; webkitAudioContext?: ConstructeurContexte }
    const Constructeur = portee.AudioContext ?? portee.webkitAudioContext
    if (typeof Constructeur !== 'function') return

    let ctx: AudioContext | null = null
    try {
      ctx = new Constructeur()
      this.construireGraphe(ctx)
    } catch {
      // Pas de carte son, contexte refusé… : le moteur reste inerte.
      this.oublierGraphe()
      if (ctx) void ctx.close().catch(() => undefined)
      return
    }
    this.ctx = ctx
    this.enPause = false
    this.graine = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
    this.dernierTic = ctx.currentTime
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    this.minuterie = setInterval(() => this.tic(), INTERVALLE_MS)
    // Humeur demandée avant le démarrage : on la lance maintenant.
    if (this.humeur) this.lancerCouche(this.humeur)
  }

  /** Fondu enchaîné (~3 s) vers la musique de cette humeur. Sans effet si c'est déjà l'humeur en cours. */
  setHumeur(h: Humeur): void {
    if (h === this.humeur || !PARTITIONS[h]) return
    // Avant `demarrer()`, on retient seulement le choix : aucun son, aucune exception.
    this.humeur = h
    if (!this.ctx) return
    try {
      this.lancerCouche(h)
    } catch {
      /* le son ne doit jamais faire tomber l'interface */
    }
  }

  /** Volumes 0..1 ; 0 coupe (et arrête de planifier des notes pour économiser le processeur). */
  setVolumes(v: { musique: number; effets: number }): void {
    this.volumes = { musique: borner01(v?.musique), effets: borner01(v?.effets) }
    const ctx = this.ctx
    if (!ctx || !this.busMusique || !this.busEffets) return
    const t = ctx.currentTime
    viser(this.busMusique.gain, gainDepuisVolume(this.volumes.musique) * NIVEAU_MUSIQUE, t, 0.04)
    viser(this.busEffets.gain, gainDepuisVolume(this.volumes.effets) * NIVEAU_EFFETS, t, 0.02)
  }

  effet(nom: NomEffet): void {
    const ctx = this.ctx
    if (!ctx || !this.synthe || !this.entreeEffets || this.enPause || this.volumes.effets <= 0) return
    const t = ctx.currentTime + 0.01
    // Garde-fous : pas de rafale du même effet, pas d'empilement sans fin.
    const dernier = this.derniersEffets.get(nom)
    if (dernier !== undefined && Math.abs(t - dernier) < 0.04) return
    if (this.voixEffets.size > 80) return
    this.derniersEffets.set(nom, t)
    try {
      this.synthetiserEffet(nom, t, this.synthe, this.entreeEffets)
    } catch {
      /* le son ne doit jamais faire tomber l'interface */
    }
  }

  /** Met la musique en pause / la reprend (fenêtre masquée). */
  pause(actif: boolean): void {
    const ctx = this.ctx
    if (!ctx || !this.porte || actif === this.enPause) return
    this.enPause = actif
    if (this.minuteriePause !== null) {
      clearTimeout(this.minuteriePause)
      this.minuteriePause = null
    }
    if (actif) {
      // Fondu court, puis suspension du contexte : plus aucun calcul audio.
      rampe(this.porte.gain, 0, ctx.currentTime, 0.25)
      this.minuteriePause = setTimeout(() => {
        this.minuteriePause = null
        if (this.enPause && this.ctx === ctx) void ctx.suspend().catch(() => undefined)
      }, 350)
    } else {
      void ctx.resume().catch(() => undefined)
      rampe(this.porte.gain, 1, ctx.currentTime, 0.4)
    }
  }

  arreter(): void {
    const ctx = this.ctx
    if (this.minuterie !== null) clearInterval(this.minuterie)
    if (this.minuteriePause !== null) clearTimeout(this.minuteriePause)
    this.minuterie = null
    this.minuteriePause = null
    this.enPause = false
    // L'humeur et les volumes restent mémorisés : un nouveau `demarrer()` reprend là où on en était.
    if (!ctx) return
    const maitre = this.maitre
    this.ctx = null
    this.oublierGraphe()
    const fermer = (): void => {
      void ctx.close().catch(() => undefined)
    }
    try {
      if (maitre && ctx.state === 'running') {
        // Fondu bref avant de fermer, pour ne pas couper net.
        rampe(maitre.gain, 0, ctx.currentTime, 0.12)
        setTimeout(fermer, 220)
        return
      }
    } catch {
      /* on ferme quand même */
    }
    fermer()
  }

  // ───────────────────────── Graphe ─────────────────────────

  private construireGraphe(ctx: AudioContext): void {
    const maitre = ctx.createGain()
    // Limiteur de sécurité : n'agit que sur les crêtes.
    const limiteur = ctx.createDynamicsCompressor()
    limiteur.threshold.value = -9
    limiteur.knee.value = 8
    limiteur.ratio.value = 14
    limiteur.attack.value = 0.004
    limiteur.release.value = 0.22
    const plafond = ctx.createGain()
    plafond.gain.value = GAIN_APRES_LIMITEUR
    maitre.connect(limiteur)
    limiteur.connect(plafond)
    plafond.connect(ctx.destination)

    const busMusique = ctx.createGain()
    busMusique.gain.value = gainDepuisVolume(this.volumes.musique) * NIVEAU_MUSIQUE
    const porte = ctx.createGain()
    busMusique.connect(porte)
    porte.connect(maitre)

    const busEffets = ctx.createGain()
    busEffets.gain.value = gainDepuisVolume(this.volumes.effets) * NIVEAU_EFFETS
    busEffets.connect(maitre)
    const entreeEffets = ctx.createGain()
    entreeEffets.connect(busEffets)

    const creerReverb = (duree: number, graine: number, sortie: AudioNode): Reverb => {
      const [gauche, droite] = calculerReponseImpulsionnelle(ctx.sampleRate, duree, graine)
      const tampon = ctx.createBuffer(2, gauche.length, ctx.sampleRate)
      tampon.getChannelData(0).set(gauche)
      tampon.getChannelData(1).set(droite)
      // Le grave n'entre pas dans la réverbération : sinon elle devient boueuse.
      const entree = ctx.createBiquadFilter()
      entree.type = 'highpass'
      entree.frequency.value = 170
      entree.Q.value = -3
      const convolution = ctx.createConvolver()
      convolution.buffer = tampon
      entree.connect(convolution)
      convolution.connect(sortie)
      return { entree, convolution }
    }
    const reverbs = {
      moyenne: creerReverb(2.6, 101, busMusique),
      vaste: creerReverb(5.5, 202, busMusique),
    }
    const reverbEffets = creerReverb(1.2, 303, busEffets)
    const envoiEffets = ctx.createGain()
    envoiEffets.gain.value = 0.2
    entreeEffets.connect(envoiEffets)
    envoiEffets.connect(reverbEffets.entree)

    // Deux secondes de bruit blanc, partagées par tous les sons bruités.
    const bruit = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate)
    const echantillons = bruit.getChannelData(0)
    for (let i = 0; i < echantillons.length; i++) echantillons[i] = Math.random() * 2 - 1

    this.synthe = new Synthe(ctx, bruit)
    this.maitre = maitre
    this.busMusique = busMusique
    this.porte = porte
    this.busEffets = busEffets
    this.entreeEffets = entreeEffets
    this.reverbs = reverbs
  }

  private oublierGraphe(): void {
    this.synthe = null
    this.maitre = null
    this.busMusique = null
    this.porte = null
    this.busEffets = null
    this.entreeEffets = null
    this.reverbs = null
    this.couches = []
    this.voixEffets.clear()
    this.derniersEffets.clear()
  }

  // ───────────────────────── Musique ─────────────────────────

  private lancerCouche(h: Humeur): void {
    const ctx = this.ctx
    if (!ctx || !this.busMusique || !this.reverbs) return
    const t = ctx.currentTime

    // Les couches en place s'éteignent en fondu ; au-delà de deux sortantes, les plus anciennes partent vite.
    let rang = 0
    for (let i = this.couches.length - 1; i >= 0; i--, rang++) {
      const c = this.couches[i]
      const duree = rang >= 2 ? 0.4 : FONDU
      if (c.finFondu !== null && c.finFondu <= t + duree) continue
      rampe(c.sortie.gain, 0, t, duree)
      c.finFondu = t + duree
    }

    const p = PARTITIONS[h]
    const entree = ctx.createGain()
    const filtre = ctx.createBiquadFilter()
    filtre.type = 'lowpass'
    filtre.frequency.value = p.filtre
    filtre.Q.value = -3
    const sortie = ctx.createGain()
    sortie.gain.value = 0
    const envoi = ctx.createGain()
    envoi.gain.value = p.reverb.niveau
    // La nappe passe par un filtre qui respire lentement : le timbre n'est jamais figé.
    const filtreNappe = ctx.createBiquadFilter()
    filtreNappe.type = 'lowpass'
    filtreNappe.frequency.value = 1300
    filtreNappe.Q.value = -3
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.05 + 0.04 * Math.random()
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 320
    lfo.connect(lfoGain)
    lfoGain.connect(filtreNappe.frequency)
    lfo.start(t)

    filtreNappe.connect(entree)
    entree.connect(filtre)
    filtre.connect(sortie)
    sortie.connect(this.busMusique)
    sortie.connect(envoi)
    envoi.connect(this.reverbs[p.reverb.salle].entree)

    this.graine = (this.graine + 0x9e3779b1) >>> 0
    const couche: Couche = {
      humeur: h,
      partition: p,
      compositeur: new Compositeur(p, this.graine),
      secParTemps: 60 / p.tempo,
      entree, filtreNappe, lfo, lfoGain, filtre, sortie, envoi,
      file: [],
      index: 0,
      debutMesure: t,
      tMesureSuivante: t + 0.2,
      finFondu: null,
      voix: new Set(),
    }
    rampe(sortie.gain, 1, t, FONDU)
    this.couches.push(couche)
  }

  private detruireCouche(c: Couche): void {
    // Le gain de la couche est à zéro : on peut tout arrêter sans clic.
    for (const v of [...c.voix]) couperVoix(c.voix, v)
    try {
      c.lfo.stop()
    } catch {
      /* déjà arrêté */
    }
    for (const n of [c.lfo, c.lfoGain, c.filtreNappe, c.entree, c.filtre, c.envoi, c.sortie]) debrancher(n)
    c.file = []
  }

  /** Boucle d'anticipation : planifie sur l'horloge audio les notes des prochaines centaines de millisecondes. */
  private tic(): void {
    const ctx = this.ctx
    if (!ctx || this.enPause) return
    try {
      const maintenant = ctx.currentTime
      // Si le minuteur est ralenti (fenêtre en arrière-plan), on planifie plus loin pour ne pas trouer la musique.
      const horizon = entre((maintenant - this.dernierTic) * 1.5 + 0.2, HORIZON, HORIZON_MAX)
      this.dernierTic = maintenant
      const audible = this.volumes.musique > 0

      let aRetirer = false
      for (const c of this.couches) {
        if (c.finFondu !== null && maintenant >= c.finFondu) {
          this.detruireCouche(c)
          aRetirer = true
          continue
        }
        if (audible) this.planifier(c, maintenant, maintenant + horizon)
      }
      if (aRetirer) this.couches = this.couches.filter(c => c.finFondu === null || maintenant < c.finFondu)
    } catch {
      /* une erreur de planification ne doit pas arrêter la boucle */
    }
  }

  private planifier(c: Couche, maintenant: number, limite: number): void {
    for (;;) {
      if (c.index >= c.file.length) {
        if (c.tMesureSuivante >= limite) return
        // Après une longue coupure (volume à zéro, minuteur gelé), on repart d'ici au lieu de rattraper.
        if (c.tMesureSuivante < maintenant - 0.25) c.tMesureSuivante = maintenant + 0.05
        const mesure = c.compositeur.mesureSuivante()
        c.file = mesure.notes
        c.index = 0
        c.debutMesure = c.tMesureSuivante
        c.tMesureSuivante += mesure.temps * c.secParTemps
        continue
      }
      const note = c.file[c.index]
      let t = c.debutMesure + note.temps * c.secParTemps
      if (t >= limite) return
      c.index++
      let duree = note.duree * c.secParTemps
      if (t < maintenant + 0.005) {
        const retard = maintenant - t
        if (retard > 0.08) {
          // Trop tard : on abandonne les notes brèves, on rattrape les longues tenues.
          if (duree - retard < 1) continue
          duree -= retard
        }
        t = maintenant + 0.005
      }
      this.jouerNote(c, note, t, duree)
    }
  }

  private jouerNote(c: Couche, n: NoteEvt, t: number, d: number): void {
    const s = this.synthe
    if (!s) return
    const ens = c.voix
    const v = n.velocite
    const f = midiVersFrequence(n.midi)
    const pan = panDepuisMidi(n.midi)
    switch (n.timbre) {
      case 'nappe':
        s.tenue(ens, c.filtreNappe, f, v, t, d, {
          types: ['triangle', 'sine'], poids: [1, 0.45], desaccord: 4, attaque: entre(d * 0.3, 0.3, 1.8), relache: 1, pan,
        })
        break
      case 'bourdon':
        s.tenue(ens, c.entree, f, v, t, d, {
          types: ['sine', 'triangle'], poids: [1, 0.5], desaccord: 3, attaque: entre(d * 0.35, 0.5, 3), relache: 1.6,
          coupure: 420,
        })
        break
      case 'basse':
        s.tenue(ens, c.entree, f, v, t, d, {
          types: ['sine', 'triangle'], desaccord: 0, attaque: 0.02, relache: 0.18, soutien: 0.55, declin: 0.5, coupure: 380,
        })
        break
      case 'cor':
        s.tenue(ens, c.entree, f, v, t, d, {
          types: ['triangle', 'sine'], poids: [1, 0.5], desaccord: 4, attaque: 0.09, relache: 0.3, soutien: 0.75, declin: 0.6,
          coupure: Math.min(2600, f * 3.5), pan,
        })
        break
      case 'piano':
        s.fm(ens, c.entree, f, v, t, {
          indice: 1.1, tcIndice: 0.28, attaque: 0.006, tc: entre(1.3 * (261.6 / f) ** 0.4, 0.5, 1.8),
          tRelache: t + d, relache: 0.4, pan,
        })
        break
      case 'harpe':
        s.frappe(ens, c.entree, f, v, t, PARTIELS_HARPE(entre(0.75 * (261.6 / f) ** 0.35, 0.3, 1.2)), {
          attaque: 0.004, pan, tRelache: t + d, relache: 0.35,
          filtre: { debut: Math.min(f * 7, 5500), fin: Math.max(f * 1.6, 500), tc: 0.12 },
        })
        break
      case 'cloche':
        s.frappe(ens, c.entree, f, v, t, PARTIELS_CLOCHE(entre((523.3 / f) ** 0.3, 0.5, 1.5)), { attaque: 0.005, pan })
        break
      case 'verre':
        s.frappe(ens, c.entree, f, v, t, PARTIELS_VERRE, { attaque: 0.012, pan })
        break
      case 'grave':
        s.tambour(ens, c.entree, t, v, { de: 110, a: 46, glisse: 0.11, attaque: 0.004, tc: 0.085 })
        break
      case 'tom':
        s.tambour(ens, c.entree, t, v, { de: 160, a: 100, glisse: 0.12, attaque: 0.004, tc: 0.1 })
        break
      case 'pouls':
        s.tambour(ens, c.entree, t, v, { de: 62, a: 42, glisse: 0.15, attaque: 0.015, tc: 0.11 })
        break
      case 'souffle':
        s.bruit(ens, c.entree, t, v, { type: 'bandpass', freq: 3400, q: 0.9, attaque: 0.005, tc: 0.03 })
        break
      case 'caisse':
        s.bruit(ens, c.entree, t, v, { type: 'bandpass', freq: 1500, q: 0.6, attaque: 0.004, tc: 0.07 })
        s.tambour(ens, c.entree, t, v * 0.5, { de: 190, a: 170, glisse: 0.05, attaque: 0.004, tc: 0.05 })
        break
    }
  }

  // ───────────────────────── Effets ─────────────────────────

  private synthetiserEffet(nom: NomEffet, t: number, s: Synthe, dest: AudioNode): void {
    const ens = this.voixEffets
    const cloche = (f: number, quand: number, crete: number, tc = 0.5): void => {
      s.frappe(ens, dest, f, crete, quand, PARTIELS_CLOCHE(tc), { attaque: 0.005 })
    }
    const cuivre = (f: number, quand: number, d: number, crete: number, coupure: number): void => {
      s.tenue(ens, dest, f, crete, quand, d, {
        types: ['triangle', 'sine'], desaccord: 3, attaque: 0.015, relache: 0.1, coupure,
      })
    }

    switch (nom) {
      case 'clic':
        s.frappe(ens, dest, 880, 0.07, t, [
          { type: 'sine', ratio: 1, gain: 1, tc: 0.012 },
          { type: 'sine', ratio: 2, gain: 0.3, tc: 0.008 },
        ], { attaque: 0.002 })
        break

      case 'page':
        s.bruit(ens, dest, t, 0.3, { type: 'bandpass', freq: 1400, freqFin: 3000, q: 0.7, attaque: 0.05, palier: 0.06, tc: 0.07 })
        break

      case 'notification':
        cloche(659.26, t, 0.13)
        cloche(880, t + 0.14, 0.13, 0.6)
        break

      case 'palier':
        // Do majeur ascendant, la dernière note plus longue.
        ;[523.25, 659.26, 783.99, 1046.5, 1318.51].forEach((f, i, liste) => {
          cloche(f, t + i * 0.075, 0.11, i === liste.length - 1 ? 0.9 : 0.45)
        })
        break

      case 'de-roule':
        for (const choc of instantsRebonds(Math.floor(Math.random() * 0xffffffff))) {
          const quand = t + choc.t
          s.bruit(ens, dest, quand, 0.22 * choc.force, {
            type: 'bandpass', freq: 1500 + 2300 * Math.random(), q: 2.5, attaque: 0.002, tc: 0.012,
          })
          s.frappe(ens, dest, 420 + 280 * Math.random(), 0.1 * choc.force, quand, [
            { type: 'sine', ratio: 1, gain: 1, tc: 0.015 },
          ], { attaque: 0.002 })
        }
        break

      case 'de-reussite':
        cloche(783.99, t, 0.12, 0.35)
        cloche(1174.66, t + 0.11, 0.13, 0.7)
        break

      case 'de-echec':
        s.tambour(ens, dest, t, 0.16, { de: 330, a: 196, glisse: 0.35, attaque: 0.02, tc: 0.16 })
        s.bruit(ens, dest, t, 0.08, { type: 'lowpass', freq: 500, q: -3, attaque: 0.004, tc: 0.05 })
        break

      case 'critique':
        // Accord aigu légèrement égrené, scintillement, et un appui grave pour le poids.
        ;[1046.5, 1318.51, 1567.98].forEach((f, i) => cloche(f, t + i * 0.02, 0.085, 0.8))
        s.bruit(ens, dest, t, 0.04, { type: 'bandpass', freq: 4500, q: 0.8, attaque: 0.005, tc: 0.12 })
        s.tambour(ens, dest, t, 0.13, { de: 196, a: 98, glisse: 0.12, attaque: 0.004, tc: 0.09 })
        break

      case 'transition':
        s.bruit(ens, dest, t, 0.28, { type: 'bandpass', freq: 350, freqFin: 2600, q: 1.2, attaque: 0.55, palier: 0.1, tc: 0.18 })
        break

      case 'coup':
        s.tambour(ens, dest, t, 0.42, { de: 130, a: 44, glisse: 0.16, attaque: 0.004, tc: 0.11 })
        s.bruit(ens, dest, t, 0.18, { type: 'lowpass', freq: 700, q: -3, attaque: 0.003, tc: 0.04 })
        break

      case 'erreur':
        cuivre(233.08, t, 0.13, 0.17, 600)
        cuivre(174.61, t + 0.16, 0.2, 0.17, 600)
        break

      case 'succes':
        // Sol, do, mi, sol : la dernière note tenue sur l'accord.
        cuivre(392, t, 0.1, 0.11, 2200)
        cuivre(523.25, t + 0.12, 0.1, 0.11, 2200)
        cuivre(659.26, t + 0.24, 0.1, 0.11, 2200)
        cuivre(783.99, t + 0.36, 0.5, 0.12, 2200)
        cuivre(523.25, t + 0.36, 0.5, 0.07, 1800)
        cuivre(659.26, t + 0.36, 0.5, 0.06, 1800)
        break
    }
  }
}
