import { describe, expect, it } from 'vitest'
import { alea, decrireResultat, lancer, modificateur, resoudre, statsDeBase, validerDemande, valeurValide } from '@core/rules/des'
import { appliquerChangements, appliquerDecouvertes, incoherencesEvidentes, trouverParNom } from '@core/rules/moteur'
import { apresScene, avancer, consigneCourante, creneauSuivant, lumiereDe, mystereAutorise, nouveauChapitre, typeEffectif } from '@core/rules/rythme'
import { fusionnerRegles, REGLES_DEFAUT } from '@core/rules/regles'
import { jouerTour, ouvrirCombat } from '@core/rules/combat'
import { lireRapport } from '@core/ai/schemas'
import { etatDeTest } from './outils'

describe('dés', () => {
  it('calcule les modificateurs comme attendu', () => {
    expect(modificateur(10)).toBe(0)
    expect(modificateur(14)).toBe(2)
    expect(modificateur(8)).toBe(-1)
    expect(modificateur(9)).toBe(-1)
  })

  it('répartit les statistiques de départ', () => {
    const s = statsDeBase(['agilite', 'charme'], 'force')
    expect(s).toMatchObject({ agilite: 14, charme: 12, force: 8, esprit: 10 })
  })

  it('reste dans les bornes du dé et est reproductible avec une graine', () => {
    const a = alea(42), b = alea(42)
    for (let i = 0; i < 200; i++) {
      const v = lancer('D20', a)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(20)
      expect(lancer('D20', b)).toBe(v)
    }
    const c = alea(7)
    for (let i = 0; i < 200; i++) expect(lancer('D100', c)).toBeLessThanOrEqual(100)
  })

  it('résout un jet : total contre difficulté, critiques prioritaires', () => {
    const e = etatDeTest()
    const d = { de: 'D20' as const, stat: 'agilite' as const, difficulte: 15, motif: 'sauter' }
    expect(resoudre(d, 13, e.hero, false)).toMatchObject({ modificateur: 2, total: 15, reussite: true, critique: null })
    expect(resoudre(d, 12, e.hero, false).reussite).toBe(false)
    expect(resoudre({ ...d, difficulte: 25 }, 20, e.hero, true)).toMatchObject({ reussite: true, critique: 'reussite', virtuel: true })
    expect(resoudre({ ...d, difficulte: 2 }, 1, e.hero, false)).toMatchObject({ reussite: false, critique: 'echec' })
  })

  it('les états du héros pèsent sur le jet', () => {
    const e = etatDeTest()
    e.hero.etats = ['Blessé au bras']
    expect(resoudre({ de: 'D20', stat: 'agilite', difficulte: 15, motif: 'x' }, 13, e.hero, false).reussite).toBe(false)
  })

  it('valide et borne une demande venue du Narrateur', () => {
    const p = { difficulte: 'normale' as const }
    expect(validerDemande({ de: 'D20', stat: 'Agilité', difficulte: '14', motif: 'crocheter' }, p, REGLES_DEFAUT)).toEqual({ de: 'D20', stat: 'agilite', difficulte: 14, motif: 'crocheter' })
    expect(validerDemande({ de: 'D20', stat: 'dextérité', difficulte: 999, motif: 'x' }, p, REGLES_DEFAUT)?.difficulte).toBe(25)
    expect(validerDemande({ de: 'D20', stat: 'agilite', difficulte: 12, motif: 'x' }, { difficulte: 'rude' }, REGLES_DEFAUT)?.difficulte).toBe(14)
    expect(validerDemande({ de: 'D20', stat: 'agilite', difficulte: 12, motif: '' }, p, REGLES_DEFAUT)).toBeNull()
    expect(validerDemande({ de: 'd100', stat: 'inconnue', difficulte: 60, motif: 'x' }, p, REGLES_DEFAUT)).toMatchObject({ de: 'D100', stat: 'volonte', difficulte: 60 })
  })

  it('refuse une valeur de dé impossible', () => {
    expect(valeurValide('D20', 21)).toBe(false)
    expect(valeurValide('D20', 0)).toBe(false)
    expect(valeurValide('D20', 7.5)).toBe(false)
    expect(valeurValide('D100', 100)).toBe(true)
  })

  it('décrit le résultat pour le Narrateur', () => {
    const e = etatDeTest()
    const r = resoudre({ de: 'D20', stat: 'agilite', difficulte: 12, motif: 'attraper la pomme' }, 17, e.hero, false)
    expect(decrireResultat(r, 'Agilité')).toContain('RÉUSSITE')
    expect(decrireResultat(r, 'Agilité')).toContain('17 +2 = 19 contre 12')
  })
})

describe('moteur de règles', () => {
  const ch = (type: any, cible: string, delta: number, motif = 'm') => ({ type, cible, delta, motif })

  it('borne la Résonance par scène et ne dépasse jamais 0..100', () => {
    const e = etatDeTest()
    const r = appliquerChangements(e, [ch('resonance', 'Séraphine', 40), ch('resonance', 'Séraphine de Valmont', 10)], REGLES_DEFAUT)
    expect(r.etat.personnages[0].resonance).toBe(15)
    expect(r.refus.length).toBeGreaterThan(0)
    const bas = appliquerChangements(e, [ch('resonance', 'Séraphine', -50)], REGLES_DEFAUT)
    expect(bas.etat.personnages[0].resonance).toBe(0)
  })

  it('ne modifie jamais l’état d’origine', () => {
    const e = etatDeTest()
    const copie = structuredClone(e)
    appliquerChangements(e, [ch('resonance', 'Séraphine', 5), ch('or', '', 10), ch('pv', '', -3)], REGLES_DEFAUT)
    expect(e).toEqual(copie)
  })

  it('plafonne les gains d’or : « je me donne 1000 pièces » ne marche pas', () => {
    const e = etatDeTest()
    const r = appliquerChangements(e, [ch('or', '', 1000)], REGLES_DEFAUT)
    expect(r.etat.hero.or).toBe(e.hero.or + REGLES_DEFAUT.heros.gainMaxOrParScene)
    expect(r.refus.join(' ')).toContain('raboté')
  })

  it('refuse une dépense sans fonds et un objet que le héros n’a pas', () => {
    const e = etatDeTest()
    const r = appliquerChangements(e, [ch('or', '', -50), ch('objet', 'Épée légendaire', -1)], REGLES_DEFAUT)
    expect(r.etat.hero.or).toBe(e.hero.or)
    expect(r.refus).toHaveLength(2)
    expect(r.notifications.some((n) => n.genre === 'refus')).toBe(true)
  })

  it('ignore une cible inconnue', () => {
    const e = etatDeTest()
    const r = appliquerChangements(e, [ch('resonance', 'Personne', 5), ch('reputation', 'Guilde fantôme', 5), ch('resonance', 'Maître Orsini', 5)], REGLES_DEFAUT)
    expect(r.notifications).toHaveLength(0)
    expect(r.refus).toHaveLength(3)
  })

  it('débloque un palier une seule fois et ajoute la capacité', () => {
    let e = etatDeTest()
    e.personnages[0].resonance = 20
    const r = appliquerChangements(e, [ch('resonance', 'Séraphine', 8)], REGLES_DEFAUT)
    expect(r.etat.personnages[0].paliersDebloques).toEqual([25])
    expect(r.etat.hero.capacites.some((c) => c.nom === 'Maintien')).toBe(true)
    expect(r.notifications.some((n) => n.genre === 'palier')).toBe(true)
    e = r.etat
    e.personnages[0].resonance = 20
    const r2 = appliquerChangements(e, [ch('resonance', 'Séraphine', 8)], REGLES_DEFAUT)
    expect(r2.etat.hero.capacites.filter((c) => c.nom === 'Maintien')).toHaveLength(1)
  })

  it('fait jouer la jalousie entre Résonances opposées, seulement entre liens déjà forts', () => {
    const e = etatDeTest()
    expect(e.personnages[0].rivales).toContain(e.personnages[1].id)
    const sans = appliquerChangements(e, [ch('resonance', 'Séraphine', 9)], REGLES_DEFAUT)
    expect(sans.etat.personnages[1].resonance).toBe(0)
    e.personnages[0].resonance = 40
    e.personnages[1].resonance = 40
    const avec = appliquerChangements(e, [ch('resonance', 'Séraphine', 9)], REGLES_DEFAUT)
    expect(avec.etat.personnages[0].resonance).toBe(49)
    expect(avec.etat.personnages[1].resonance).toBe(37)
  })

  it('signale le franchissement des seuils de réputation', () => {
    const e = etatDeTest()
    e.factions[0].reputation = -45
    const r = appliquerChangements(e, [ch('reputation', 'Haute Noblesse', -10)], REGLES_DEFAUT)
    expect(r.etat.factions[0].reputation).toBe(-55)
    expect(r.notifications.some((n) => n.texte.includes('agit désormais contre vous'))).toBe(true)
  })

  it('gère PV, états et objets', () => {
    const e = etatDeTest()
    const r = appliquerChangements(e, [ch('pv', '', -999), ch('etat', 'Fatigué', 1), ch('objet', 'Plume', 1, 'Une plume d’oie')], REGLES_DEFAUT)
    expect(r.etat.hero.pv).toBe(0)
    expect(r.etat.hero.etats).toEqual(expect.arrayContaining(['Fatigué', 'Inconscient']))
    expect(r.etat.hero.inventaire.some((o) => o.nom === 'Plume')).toBe(true)
  })

  it('applique les découvertes : journal sans doublon, rencontre, lieu, souvenirs', () => {
    const e = etatDeTest()
    const rapport = lireRapport({
      lieu: 'Bibliothèque', presents: ['Maëlle'], journal: [{ type: 'rumeur', texte: 'On dit que la tour est hantée.' }, { type: 'rumeur', texte: 'On dit que la tour est hantée.' }],
      objectifsAccomplis: ['Trouver le dortoir des Boursiers.'], souvenirs: [{ personnage: 'Maëlle', texte: 'Il lit vite.' }],
      nouveauxPersonnages: [{ nom: 'Tobias', description: 'Concierge.', apparence: 'vieil homme' }],
    })
    const r = appliquerDecouvertes(e, rapport)
    expect(r.etat.journal.filter((j) => j.type === 'rumeur')).toHaveLength(1)
    expect(r.etat.journal.find((j) => j.type === 'objectif')?.statut).toBe('accompli')
    expect(r.etat.personnages[1].rencontre).toBe(true)
    expect(r.etat.personnages[1].souvenirs[0]).toContain('Il lit vite')
    expect(r.etat.lieux.find((l) => l.id === r.etat.lieuActuel)?.nom).toBe('Bibliothèque')
    expect(trouverParNom(r.etat.personnages, 'tobias')?.role).toBe('secondaire')
  })

  it('détecte sans IA un mort qui parle et un héros qu’on fait parler', () => {
    const e = etatDeTest()
    e.personnages[2].statut = 'mort'
    const pb = incoherencesEvidentes(e, ['Maître Orsini', 'Aubin', 'Séraphine de Valmont'])
    expect(pb).toHaveLength(2)
  })

  it('fusionne prudemment une surcharge de règles', () => {
    const r = fusionnerRegles(REGLES_DEFAUT, { resonance: { maxParScene: 8, inconnu: 3 }, reputation: { hostile: 'non' }, calendrier: null })
    expect(r.resonance.maxParScene).toBe(8)
    expect(r.reputation.hostile).toBe(-50)
    expect(r.calendrier.scenesMaxParCreneau).toBe(REGLES_DEFAUT.calendrier.scenesMaxParCreneau)
    expect((r.resonance as any).inconnu).toBeUndefined()
  })
})

describe('rythme et calendrier', () => {
  it('interdit le mystère au début, puis le rationne', () => {
    const e = etatDeTest()
    expect(mystereAutorise(e, REGLES_DEFAUT)).toBe(false)
    expect(typeEffectif('mystere', e, REGLES_DEFAUT)).toBe('quotidien')
    expect(typeEffectif('relation', e, REGLES_DEFAUT)).toBe('relation')
    const cfg = REGLES_DEFAUT.rythme.lent
    for (let i = 0; i < cfg.debutSansMystere; i++) e.rythme = apresScene(e.rythme, false)
    expect(mystereAutorise(e, REGLES_DEFAUT)).toBe(true)
    e.rythme = apresScene(e.rythme, true)
    expect(e.rythme.indicesRestants).toBe(0)
    expect(mystereAutorise(e, REGLES_DEFAUT)).toBe(false)
    for (let i = 0; i < 40; i++) e.rythme = apresScene(e.rythme, false)
    expect(mystereAutorise(e, REGLES_DEFAUT)).toBe(false) // budget du chapitre épuisé
    e.rythme = nouveauChapitre(e.rythme, e, REGLES_DEFAUT)
    expect(mystereAutorise(e, REGLES_DEFAUT)).toBe(true)
  })

  it('met le budget en dette quand un indice sort hors budget', () => {
    const e = etatDeTest()
    e.rythme = apresScene(e.rythme, true)
    e.rythme = apresScene(e.rythme, true)
    expect(e.rythme.indicesRestants).toBe(-1)
    e.rythme = nouveauChapitre(e.rythme, e, REGLES_DEFAUT)
    expect(e.rythme.indicesRestants).toBe(0)
  })

  it('plafonne la consigne du Metteur en scène', () => {
    const e = etatDeTest()
    e.plan = { jour: 1, intention: '', consignes: [{ creneau: 'matin', type: 'mystere', consigne: 'Un cours.', personnages: [] }] }
    expect(consigneCourante(e, REGLES_DEFAUT)).toMatchObject({ type: 'quotidien', consigne: 'Un cours.' })
  })

  it('fait avancer le temps : créneaux, journées, chapitres', () => {
    let c = { jour: 1, creneau: 0, scenesDansCreneau: 0 }
    let a = avancer(c, false, REGLES_DEFAUT)
    expect(a).toMatchObject({ nouveauCreneau: false, calendrier: { creneau: 0, scenesDansCreneau: 1 } })
    a = avancer(a.calendrier, false, REGLES_DEFAUT)
    expect(a).toMatchObject({ nouveauCreneau: true, calendrier: { creneau: 1, scenesDansCreneau: 0 } })
    a = avancer({ jour: 1, creneau: 4, scenesDansCreneau: 0 }, true, REGLES_DEFAUT)
    expect(a).toMatchObject({ nouveauJour: true, nouveauChapitre: false, calendrier: { jour: 2, creneau: 0 } })
    c = { jour: 7, creneau: 4, scenesDansCreneau: 0 }
    expect(creneauSuivant(c, REGLES_DEFAUT)).toMatchObject({ nouveauJour: true, nouveauChapitre: true, calendrier: { jour: 8 } })
    expect(lumiereDe({ jour: 1, creneau: 3, scenesDansCreneau: 0 })).toBe('crepuscule')
    expect(lumiereDe({ jour: 1, creneau: 4, scenesDansCreneau: 0 })).toBe('nuit')
  })
})

describe('combat', () => {
  it('se résout par les règles, de façon reproductible', () => {
    const e = etatDeTest()
    e.combat = ouvrirCombat(e, 'Un duel', [{ nom: 'Brute', pv: 6, attaque: 1, defense: 10 }], [])
    const a = jouerTour(e, { type: 'attaque', cible: 'e1' }, 20, 123)
    const b = jouerTour(e, { type: 'attaque', cible: 'e1' }, 20, 123)
    expect(a.etat.combat).toEqual(b.etat.combat)
    expect(a.etat.combat?.issue).toBe('victoire')
    expect(a.etat.stats.combats).toBe(1)
    expect(e.combat.actif).toBe(true) // l'état d'origine n'est pas touché
  })

  it('une héroïne proche se bat aux côtés du héros', () => {
    const e = etatDeTest()
    e.personnages[0].resonance = 30
    const c = ouvrirCombat(e, 'Embuscade', [{ nom: 'Voleur', pv: 10, attaque: 2, defense: 11 }], ['Séraphine de Valmont'])
    expect(c.combattants.filter((x) => x.camp === 'allie')).toHaveLength(1)
  })

  it('refuse une technique sans mana et permet la fuite', () => {
    const e = etatDeTest()
    e.hero.mana = 0
    e.combat = ouvrirCombat(e, 'Un duel', [{ nom: 'Brute', pv: 30, attaque: 0, defense: 18 }], [])
    const t = jouerTour(e, { type: 'technique', capacite: 'cap-base', cible: 'e1' }, 15, 1)
    expect(t.notifications.some((n) => n.genre === 'refus')).toBe(true)
    const f = jouerTour(e, { type: 'fuite' }, 20, 1)
    expect(f.etat.combat?.issue).toBe('fuite')
  })
})
