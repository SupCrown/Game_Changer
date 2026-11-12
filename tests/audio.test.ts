import { describe, expect, it } from 'vitest'
import type { Humeur } from '@shared/types'
import {
  Compositeur,
  FORMES,
  GAMMES,
  HUMEURS,
  PARTITIONS,
  classe,
  creerAleatoire,
  degreVersMidi,
  dispositionNappe,
  echelleMelodie,
  midiVersFrequence,
  notesAccord,
  replier,
  type Mesure,
  type NoteEvt,
} from '../src/renderer/src/audio/partitions'
import {
  MoteurAudio,
  borner01,
  calculerReponseImpulsionnelle,
  gainDepuisVolume,
  instantsRebonds,
  panDepuisMidi,
  type NomEffet,
} from '../src/renderer/src/audio/moteur'

const composer = (h: Humeur, graine: number, n: number): Mesure[] => {
  const c = new Compositeur(PARTITIONS[h], graine)
  return Array.from({ length: n }, () => c.mesureSuivante())
}

const classesGamme = (h: Humeur): Set<number> => {
  const p = PARTITIONS[h]
  return new Set(GAMMES[p.gamme].map(i => classe(p.tonique + i)))
}

const hauteurs = (m: Mesure): NoteEvt[] => m.notes.filter(n => n.voix !== 'percu')

describe('conversions et hasard', () => {
  it('convertit les notes MIDI en fréquences', () => {
    expect(midiVersFrequence(69)).toBeCloseTo(440, 6)
    expect(midiVersFrequence(57)).toBeCloseTo(220, 6)
    expect(midiVersFrequence(60)).toBeCloseTo(261.626, 2)
    expect(midiVersFrequence(81)).toBeCloseTo(880, 6)
  })

  it('produit un hasard reproductible dans [0, 1)', () => {
    const a = creerAleatoire(42)
    const b = creerAleatoire(42)
    const c = creerAleatoire(43)
    const suiteA = Array.from({ length: 500 }, a)
    const suiteB = Array.from({ length: 500 }, b)
    const suiteC = Array.from({ length: 500 }, c)
    expect(suiteA).toEqual(suiteB)
    expect(suiteA).not.toEqual(suiteC)
    expect(suiteA.every(x => x >= 0 && x < 1)).toBe(true)
    const moyenne = suiteA.reduce((s, x) => s + x, 0) / suiteA.length
    expect(moyenne).toBeGreaterThan(0.4)
    expect(moyenne).toBeLessThan(0.6)
  })

  it('parcourt la gamme au-delà de l’octave et en dessous de la tonique', () => {
    const majeur = GAMMES.majeur
    expect(degreVersMidi(60, majeur, 0)).toBe(60)
    expect(degreVersMidi(60, majeur, 2)).toBe(64)
    expect(degreVersMidi(60, majeur, 7)).toBe(72)
    expect(degreVersMidi(60, majeur, 8)).toBe(74)
    expect(degreVersMidi(60, majeur, -1)).toBe(59)
    expect(degreVersMidi(60, majeur, -7)).toBe(48)
  })

  it('replie une note dans une octave sans changer son nom', () => {
    for (const midi of [12, 47, 60, 61, 95]) {
      for (const bas of [33, 45, 60]) {
        const r = replier(midi, bas)
        expect(r).toBeGreaterThanOrEqual(bas)
        expect(r).toBeLessThan(bas + 12)
        expect(classe(r)).toBe(classe(midi))
      }
    }
  })
})

describe('partitions', () => {
  it('définit les sept humeurs avec des réglages plausibles', () => {
    expect([...HUMEURS].sort()).toEqual(Object.keys(PARTITIONS).sort())
    expect(HUMEURS).toHaveLength(7)
    for (const h of HUMEURS) {
      const p = PARTITIONS[h]
      expect(p.humeur).toBe(h)
      expect(p.tempo).toBeGreaterThanOrEqual(40)
      expect(p.tempo).toBeLessThanOrEqual(130)
      expect(p.progressions.length).toBeGreaterThanOrEqual(2)
      for (const prog of p.progressions) expect(prog.length).toBeGreaterThanOrEqual(2)
      expect(p.reverb.niveau).toBeGreaterThan(0)
      expect(p.reverb.niveau).toBeLessThanOrEqual(1)
      expect(p.filtre).toBeGreaterThan(1000)
    }
  })

  it('donne à chaque humeur un caractère distinct', () => {
    expect(PARTITIONS.joyeux.gamme).toBe('majeur')
    expect(PARTITIONS.triste.gamme).toBe('mineur')
    expect(PARTITIONS.joyeux.tempo).toBeGreaterThan(PARTITIONS.calme.tempo)
    expect(PARTITIONS.triste.tempo).toBeLessThan(PARTITIONS.calme.tempo)
    expect(PARTITIONS.combat.percussion?.style).toBe('combat')
    expect(PARTITIONS.tendu.bourdon).not.toBeNull()
    expect(PARTITIONS.mystere.reverb.salle).toBe('vaste')
    expect(PARTITIONS.mystere.reverb.niveau).toBeGreaterThan(PARTITIONS.calme.reverb.niveau)
    // Intervalles ouverts pour le mystère : aucune tierce empilée.
    for (const prog of PARTITIONS.mystere.progressions) {
      for (const accord of prog) expect(['quinte', 'quartes', 'sus2', 'sus4']).toContain(accord.forme)
    }
    for (const h of ['calme', 'romance'] as const) {
      const timbres = [PARTITIONS[h].arpege?.timbre, PARTITIONS[h].melodie?.timbre]
      expect(timbres.some(t => t === 'piano' || t === 'harpe')).toBe(true)
    }
    const signatures = HUMEURS.map(h => `${PARTITIONS[h].tonique}-${PARTITIONS[h].gamme}-${PARTITIONS[h].tempo}`)
    expect(new Set(signatures).size).toBe(HUMEURS.length)
  })

  it('construit des accords dans la gamme', () => {
    for (const h of HUMEURS) {
      const p = PARTITIONS[h]
      const gamme = classesGamme(h)
      for (const prog of p.progressions) {
        for (const accord of prog) {
          const notes = notesAccord(p, accord)
          expect(notes).toHaveLength(FORMES[accord.forme].length)
          expect(notes.every(n => gamme.has(classe(n)))).toBe(true)
          const nappe = dispositionNappe(p, accord)
          expect(new Set(nappe.map(classe))).toEqual(new Set(notes.map(classe)))
          expect(nappe[0]).toBeGreaterThanOrEqual(p.nappe.registre)
          expect(nappe[0]).toBeLessThan(p.nappe.registre + 12)
          expect([...nappe].sort((x, y) => x - y)).toEqual(nappe)
        }
      }
    }
  })

  it('accorde un do majeur comme attendu', () => {
    const p = { ...PARTITIONS.calme, tonique: 60 }
    expect(notesAccord(p, { degre: 0, forme: 'triade' })).toEqual([60, 64, 67])
    expect(notesAccord(p, { degre: 4, forme: 'septieme' })).toEqual([67, 71, 74, 77])
    expect(notesAccord(p, { degre: 5, forme: 'triade' })).toEqual([69, 72, 76])
  })

  it('limite l’échelle de la mélodie aux degrés autorisés et au registre', () => {
    for (const h of HUMEURS) {
      const p = PARTITIONS[h]
      if (!p.melodie) continue
      const echelle = echelleMelodie(p)
      const autorisees = new Set(p.melodie.degres.map(d => classe(p.tonique + GAMMES[p.gamme][d])))
      expect(echelle.length).toBeGreaterThanOrEqual(6)
      for (const n of echelle) {
        expect(autorisees.has(classe(n))).toBe(true)
        expect(n).toBeGreaterThanOrEqual(p.melodie.registre[0])
        expect(n).toBeLessThanOrEqual(p.melodie.registre[1])
      }
    }
  })
})

describe('composition générative', () => {
  it('est déterministe à graine égale et différente sinon', () => {
    for (const h of HUMEURS) {
      expect(composer(h, 1234, 48)).toEqual(composer(h, 1234, 48))
      expect(composer(h, 1234, 48)).not.toEqual(composer(h, 4321, 48))
    }
  })

  it('reste dans la gamme, les registres et les bornes de fréquence', () => {
    for (const h of HUMEURS) {
      const p = PARTITIONS[h]
      const gamme = classesGamme(h)
      for (const graine of [1, 7, 99991]) {
        for (const m of composer(h, graine, 96)) {
          expect(m.temps).toBe(p.tempsParMesure)
          for (const n of m.notes) {
            expect(n.temps).toBeGreaterThanOrEqual(0)
            expect(n.temps).toBeLessThan(m.temps)
            expect(n.duree).toBeGreaterThan(0)
            expect(n.velocite).toBeGreaterThan(0)
            expect(n.velocite).toBeLessThanOrEqual(0.25)
          }
          for (const n of hauteurs(m)) {
            expect(Number.isInteger(n.midi)).toBe(true)
            expect(gamme.has(classe(n.midi))).toBe(true)
            const f = midiVersFrequence(n.midi)
            expect(f).toBeGreaterThan(40)
            expect(f).toBeLessThan(1700)
          }
          for (const n of m.notes.filter(x => x.voix === 'melodie')) {
            expect(n.midi).toBeGreaterThanOrEqual(p.melodie!.registre[0])
            expect(n.midi).toBeLessThanOrEqual(p.melodie!.registre[1])
          }
          for (const n of m.notes.filter(x => x.voix === 'arpege')) {
            expect(n.midi).toBeGreaterThanOrEqual(p.arpege!.registre[0])
            expect(n.midi).toBeLessThanOrEqual(p.arpege!.registre[1])
          }
        }
      }
    }
  })

  it('trie les notes de chaque mesure par ordre de début', () => {
    for (const h of HUMEURS) {
      for (const m of composer(h, 5, 64)) {
        const temps = m.notes.map(n => n.temps)
        expect([...temps].sort((x, y) => x - y)).toEqual(temps)
      }
    }
  })

  it('suit une progression de la partition et pose une nappe à chaque changement d’accord', () => {
    for (const h of HUMEURS) {
      const p = PARTITIONS[h]
      const mesures = composer(h, 2024, 96)
      mesures.forEach((m, i) => {
        expect(m.index).toBe(i)
        expect(p.progressions.some(prog => prog.includes(m.accord))).toBe(true)
        const nappe = m.notes.filter(n => n.voix === 'nappe')
        if (i % p.mesuresParAccord === 0) {
          expect(nappe.length).toBeGreaterThanOrEqual(3)
          expect(nappe.every(n => n.temps === 0 && n.duree === p.tempsParMesure * p.mesuresParAccord)).toBe(true)
          const attendues = new Set(notesAccord(p, m.accord).map(classe))
          expect(new Set(nappe.map(n => classe(n.midi)))).toEqual(attendues)
        } else {
          expect(nappe).toHaveLength(0)
        }
      })
      // Un accord dure exactement `mesuresParAccord` mesures.
      for (let i = 0; i + p.mesuresParAccord <= mesures.length; i += p.mesuresParAccord) {
        for (let k = 1; k < p.mesuresParAccord; k++) expect(mesures[i + k].accord).toBe(mesures[i].accord)
      }
    }
  })

  it('fait avancer la mélodie par petits pas (marche contrainte)', () => {
    for (const h of HUMEURS) {
      for (const graine of [3, 11, 808]) {
        const melodie = composer(h, graine, 200).flatMap(m => m.notes.filter(n => n.voix === 'melodie'))
        expect(melodie.length).toBeGreaterThan(20)
        let conjoints = 0
        for (let i = 1; i < melodie.length; i++) {
          const saut = Math.abs(melodie[i].midi - melodie[i - 1].midi)
          expect(saut).toBeLessThanOrEqual(9)
          if (saut <= 4) conjoints++
        }
        // La plupart des mouvements sont conjoints ou presque.
        expect(conjoints / (melodie.length - 1)).toBeGreaterThan(0.6)
        // La marche explore le registre au lieu de rester collée à une note.
        expect(new Set(melodie.map(n => n.midi)).size).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('laisse beaucoup de silence dans la mélodie', () => {
    for (const h of HUMEURS) {
      const p = PARTITIONS[h]
      const mesures = composer(h, 77, 240)
      const cases = p.tempsParMesure * p.melodie!.pas
      const avecMelodie = mesures.filter(m => m.notes.some(n => n.voix === 'melodie'))
      const notes = avecMelodie.reduce((s, m) => s + m.notes.filter(n => n.voix === 'melodie').length, 0)
      // Au moins un quart des mesures sans mélodie, et jamais plus de la moitié des cases remplies.
      expect(avecMelodie.length / mesures.length).toBeLessThan(0.75)
      expect(avecMelodie.length).toBeGreaterThan(10)
      expect(notes / (mesures.length * cases)).toBeLessThan(0.5)
      // Entrée en douceur : pas de mélodie sur le premier accord.
      for (let i = 0; i < p.mesuresParAccord; i++) {
        expect(mesures[i].notes.some(n => n.voix === 'melodie')).toBe(false)
      }
    }
  })

  it('reste sobre : densité de notes bornée', () => {
    for (const h of HUMEURS) {
      const p = PARTITIONS[h]
      const mesures = composer(h, 31337, 128)
      const duree = mesures.length * p.tempsParMesure * (60 / p.tempo)
      const parSeconde = mesures.reduce((s, m) => s + m.notes.length, 0) / duree
      expect(parSeconde).toBeGreaterThan(0.5)
      expect(parSeconde).toBeLessThan(h === 'combat' ? 20 : 10)
    }
  })

  it('varie au fil du temps au lieu de boucler', () => {
    for (const h of HUMEURS) {
      const p = PARTITIONS[h]
      const mesures = composer(h, 606, 256)
      const signature = (m: Mesure): string => m.notes.map(n => `${n.voix}:${n.midi}:${n.temps.toFixed(2)}`).join('|')
      expect(new Set(mesures.map(signature)).size).toBeGreaterThan(mesures.length * 0.5)
      // Plusieurs progressions sont réellement utilisées.
      const utilisees = new Set(mesures.map(m => p.progressions.findIndex(prog => prog.includes(m.accord))))
      expect(utilisees.size).toBeGreaterThanOrEqual(2)
      // La première et la seconde moitié ne sont pas identiques.
      const moitie = mesures.length / 2
      expect(mesures.slice(0, moitie).map(signature)).not.toEqual(mesures.slice(moitie).map(signature))
    }
  })

  it('donne à chaque humeur ses voix caractéristiques', () => {
    const voix = (h: Humeur): Set<string> => new Set(composer(h, 9, 64).flatMap(m => m.notes.map(n => n.timbre)))
    expect(voix('combat').has('grave')).toBe(true)
    expect(voix('combat').has('souffle')).toBe(true)
    expect(voix('tendu').has('bourdon')).toBe(true)
    expect(voix('tendu').has('pouls')).toBe(true)
    for (const h of ['calme', 'romance', 'mystere', 'triste'] as const) {
      const percussions = composer(h, 9, 64).flatMap(m => m.notes.filter(n => n.voix === 'percu'))
      expect(percussions).toHaveLength(0)
    }
    // Le bourdon tient la tonique, quel que soit l'accord.
    const p = PARTITIONS.tendu
    const graves = composer('tendu', 9, 32).flatMap(m => m.notes.filter(n => n.voix === 'bourdon'))
    expect(Math.min(...graves.map(n => n.midi)) % 12).toBe(p.tonique % 12)
  })

  it('tient un pouls régulier en combat (temps forts toujours marqués)', () => {
    for (const m of composer('combat', 12, 64)) {
      const graves = m.notes.filter(n => n.timbre === 'grave').map(n => n.temps)
      expect(graves).toContain(0)
      expect(graves).toContain(2)
    }
  })
})

describe('logique pure du moteur', () => {
  it('borne et convertit les volumes', () => {
    expect(borner01(-1)).toBe(0)
    expect(borner01(2)).toBe(1)
    expect(borner01(Number.NaN)).toBe(0)
    expect(borner01(0.3)).toBe(0.3)
    expect(gainDepuisVolume(0)).toBe(0)
    expect(gainDepuisVolume(1)).toBe(1)
    expect(gainDepuisVolume(5)).toBe(1)
    let precedent = 0
    for (let v = 0.05; v <= 1; v += 0.05) {
      const g = gainDepuisVolume(v)
      expect(g).toBeGreaterThan(precedent)
      expect(g).toBeLessThanOrEqual(1)
      precedent = g
    }
  })

  it('génère une réponse impulsionnelle bornée, décroissante et stéréo', () => {
    const taux = 8000
    const [g, d] = calculerReponseImpulsionnelle(taux, 2, 5)
    expect(g).toHaveLength(taux * 2)
    expect(d).toHaveLength(taux * 2)
    const energie = (x: Float32Array, debut: number, fin: number): number => {
      let s = 0
      for (let i = debut; i < fin; i++) s += x[i] * x[i]
      return s / (fin - debut)
    }
    for (const canal of [g, d]) {
      expect(canal.every(x => Number.isFinite(x) && Math.abs(x) <= 1)).toBe(true)
      expect(Math.abs(canal[0])).toBe(0)
      const debut = energie(canal, 0, taux / 4)
      const milieu = energie(canal, taux, taux + taux / 4)
      const fin = energie(canal, 2 * taux - taux / 4, 2 * taux)
      expect(debut).toBeGreaterThan(milieu * 10)
      expect(milieu).toBeGreaterThan(fin * 10)
    }
    // Canaux décorrélés (sinon pas d'espace), mais reproductibles.
    expect(Array.from(g.slice(0, 200))).not.toEqual(Array.from(d.slice(0, 200)))
    expect(calculerReponseImpulsionnelle(taux, 2, 5)[0]).toEqual(g)
  })

  it('répartit les chocs du dé de façon irrégulière sur environ 0,8 s', () => {
    for (const graine of [1, 2, 3, 500]) {
      const chocs = instantsRebonds(graine)
      expect(chocs.length).toBeGreaterThanOrEqual(6)
      expect(chocs.length).toBeLessThanOrEqual(21)
      expect(chocs[0].t).toBe(0)
      expect(chocs[chocs.length - 1].t).toBeLessThan(0.8)
      const ecarts = chocs.slice(1).map((c, i) => c.t - chocs[i].t)
      expect(ecarts.every(e => e >= 0.04 && e <= 0.13)).toBe(true)
      expect(new Set(ecarts.map(e => e.toFixed(4))).size).toBeGreaterThan(ecarts.length / 2)
      expect(chocs.every(c => c.force > 0 && c.force <= 1)).toBe(true)
    }
    expect(instantsRebonds(8)).toEqual(instantsRebonds(8))
  })

  it('place les notes dans un champ stéréo modéré', () => {
    for (let midi = 24; midi <= 96; midi++) {
      expect(Math.abs(panDepuisMidi(midi))).toBeLessThanOrEqual(0.35 + 1e-9)
    }
  })
})

describe('moteur sans API Web Audio', () => {
  const effets: NomEffet[] = [
    'clic', 'page', 'notification', 'palier', 'de-roule', 'de-reussite', 'de-echec',
    'critique', 'transition', 'coup', 'erreur', 'succes',
  ]

  it('reste inerte et ne lève jamais d’exception', () => {
    expect('AudioContext' in globalThis).toBe(false)
    const moteur = new MoteurAudio()
    expect(() => {
      // Avant demarrer()
      moteur.setHumeur('calme')
      moteur.setVolumes({ musique: 0.5, effets: 0.5 })
      moteur.pause(true)
      moteur.pause(false)
      for (const e of effets) moteur.effet(e)
      moteur.arreter()
      // Après demarrer(), sans AudioContext disponible
      moteur.demarrer()
      moteur.demarrer()
      for (const h of HUMEURS) moteur.setHumeur(h)
      moteur.setVolumes({ musique: 0, effets: 0 })
      moteur.setVolumes({ musique: Number.NaN, effets: 7 })
      for (const e of effets) moteur.effet(e)
      moteur.pause(true)
      moteur.pause(false)
      moteur.arreter()
      moteur.arreter()
    }).not.toThrow()
  })
})
