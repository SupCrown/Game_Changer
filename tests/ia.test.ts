import { describe, expect, it } from 'vitest'
import { AnalyseurFlux, analyserLigne, analyserProse, lireExpression, lireJet, proseLisible } from '@core/ai/prose'
import { extraireJson, lireMonde, lireNuit, lirePlan, lireRapport, lireVerdict, MondeSchema, RapportSceneSchema } from '@core/ai/schemas'
import { coutDe, FiltreReflexion, fusionnerMessages, tarifDe } from '@core/ai/types'
import { bibleFixe, lienQualitatif, systemeNarrateur } from '@core/ai/prompts/fr'
import { blocMemoire, blocVolatile, compacter, construireNarrateur, type SceneContexte } from '@core/memory/contexte'
import { decouper, retrouver, VectoriseurIntegre, versBlob, depuisBlob, type Souvenir } from '@core/memory/vecteurs'
import { REGLES_DEFAUT } from '@core/rules/regles'
import { REGLAGES_DEFAUT } from '@shared/types'
import { z } from 'zod'
import { etatDeTest, MONDE_BRUT } from './outils'

describe('lecture de la prose du Narrateur', () => {
  it('reconnaît narration, répliques, chuchotements, lieu et jet', () => {
    const p = analyserProse([
      '[[LIEU: Bibliothèque de l’Aile Nord]]',
      '',
      'La pluie tambourine contre les vitraux.',
      'Séraphine (gêne) : « Tu es encore là ? »',
      'Maëlle Corvin (sourire) : *« Ne le répète à personne. »*',
      'Maître Orsini : « Debout ! »',
      '[[JET: D20 | agilité | 14 | rattraper le grimoire]]',
    ].join('\n'))
    expect(p.lieu).toBe('Bibliothèque de l’Aile Nord')
    expect(p.lignes.map((l) => l.type)).toEqual(['lieu', 'narration', 'replique', 'replique', 'replique'])
    expect(p.lignes[2]).toMatchObject({ personnage: 'Séraphine', expression: 'gene', texte: 'Tu es encore là ?', chuchote: false })
    expect(p.lignes[3]).toMatchObject({ personnage: 'Maëlle Corvin', expression: 'sourire', chuchote: true, texte: 'Ne le répète à personne.' })
    expect(p.lignes[4]).toMatchObject({ personnage: 'Maître Orsini', expression: 'neutre' })
    expect(p.jet).toEqual({ de: 'D20', stat: 'agilité', difficulte: '14', motif: 'rattraper le grimoire' })
    expect(p.locuteurs).toEqual(['Séraphine', 'Maëlle Corvin', 'Maître Orsini'])
  })

  it('ne prend pas une phrase de narration avec deux-points pour une réplique', () => {
    expect(analyserLigne('Une seule certitude : il fallait partir.')?.type).toBe('narration')
    expect(analyserLigne('Il hésita, puis ajouta : rien.')?.type).toBe('narration')
    expect(analyserLigne('Note : ceci est un test.')?.type).toBe('narration')
  })

  it('tolère les variantes d’écriture des modèles', () => {
    expect(lireJet('[JET : D100 | Perception | DD 60 | repérer la trappe]')).toMatchObject({ de: 'D100', stat: 'Perception', difficulte: '60' })
    expect(lireJet('[[JET: charme | 12 | convaincre le garde]]')).toMatchObject({ de: 'D20', stat: 'charme', difficulte: '12', motif: 'convaincre le garde' })
    expect(lireJet('Rien ici.')).toBeNull()
    expect(analyserLigne('**Séraphine** (furieuse) : "Sortez."')).toMatchObject({ type: 'replique', personnage: 'Séraphine', expression: 'colere', texte: 'Sortez.' })
    expect(analyserLigne('---')).toBeNull()
    expect(analyserLigne('## Chapitre')).toMatchObject({ type: 'narration', texte: 'Chapitre' })
    expect(lireExpression('en chuchotant, amusée')).toEqual({ expression: 'sourire', chuchote: true })
    expect(lireExpression('inconnue')).toEqual({ expression: 'neutre', chuchote: false })
  })

  it('découpe un flux en lignes, quel que soit le morcellement', () => {
    const texte = 'Première ligne.\nSéraphine (colere) : « Non. »\nDernière ligne sans retour'
    for (const pas of [1, 3, 7, 1000]) {
      const a = new AnalyseurFlux()
      const lignes = []
      for (let i = 0; i < texte.length; i += pas) lignes.push(...a.pousser(texte.slice(i, i + pas)))
      lignes.push(...a.terminer())
      expect(lignes.map((l) => l.type)).toEqual(['narration', 'replique', 'narration'])
      expect(a.texte).toBe(texte)
    }
  })

  it('n’émet pas les balises techniques dans le texte lisible', () => {
    const t = proseLisible('[[LIEU: Cour]]\nIl pleut.\n[[JET: D20 | force | 10 | pousser]]')
    expect(t).toBe('Il pleut.')
  })
})

describe('lecture tolérante des sorties structurées', () => {
  it('extrait le JSON d’une réponse bavarde', () => {
    expect(extraireJson('Voici :\n```json\n{"a": {"b": "}"}, "c": 1}\n```\nVoilà.')).toEqual({ a: { b: '}' }, c: 1 })
    expect(() => extraireJson('rien')).toThrow()
    expect(() => extraireJson('{"a": 1')).toThrow()
  })

  it('rend toujours un rapport sain, même à partir de n’importe quoi', () => {
    for (const brut of [null, 42, 'texte', [], {}, { changements: 'oui', pistes: 3, humeur: 'bizarre' }]) {
      const r = lireRapport(brut)
      expect(Array.isArray(r.changements)).toBe(true)
      expect(r.humeur).toBe('calme')
      expect(r.momentFort).toBeNull()
    }
    const r = lireRapport({
      resume: ' Une scène. ', type_lieu: 'Bibliothèque', personnages_presents: 'Séraphine',
      changements: [{ type: 'Résonance', cible: 'Séraphine', delta: '+4', motif: 'x' }, { type: 'or', cible: '', delta: 0 }],
      fin_creneau: 'oui', indice_revele: 'false', incoherence: 'Aucune.', humeur: 'Mystère', pistes: ['a', 'b', 'c', 'd', 'e'],
      moment_fort: { titre: 'Sous la pluie', description: 'Deux silhouettes.' },
    })
    expect(r.typeLieu).toBe('bibliotheque')
    expect(r.presents).toEqual(['Séraphine'])
    expect(r.changements).toEqual([{ type: 'resonance', cible: 'Séraphine', delta: 4, motif: 'x' }])
    expect(r).toMatchObject({ finCreneau: true, indiceRevele: false, incoherence: '', humeur: 'mystere' })
    expect(r.pistes).toHaveLength(4)
    expect(r.momentFort?.titre).toBe('Sous la pluie')
  })

  it('impose la majorité des personnages à la lecture du monde', () => {
    const m = lireMonde({ ...MONDE_BRUT, personnages: [{ ...MONDE_BRUT.personnages[0], age: 16 }] })
    expect(m.personnages[0].age).toBe(18)
    expect(lireMonde({}).titre).toBe('Résonance')
  })

  it('lit plans, nuits et verdicts incomplets', () => {
    expect(lirePlan({ consignes: [{ creneau: 'Après-midi', type: 'Relation', consigne: 'x' }], tension: 99 })).toMatchObject({ tension: 10, consignes: [{ creneau: 'apres-midi', type: 'relation' }] })
    expect(lireNuit({ resume_jour: 'r', hors_champ: [{ personnage: 'A', action: 'b' }] }).horsChamp).toHaveLength(1)
    expect(lireVerdict({ verdict: 'JUSTE' }).verdict).toBe('juste')
    expect(lireVerdict({}).verdict).toBe('fausse')
  })

  it('produit des schémas JSON exploitables par les fournisseurs', () => {
    for (const s of [RapportSceneSchema, MondeSchema]) {
      const j = z.toJSONSchema(s) as any
      expect(j.type).toBe('object')
      expect(Array.isArray(j.required)).toBe(true)
    }
  })
})

describe('fournisseurs : utilitaires', () => {
  it('calcule un coût à partir des tarifs connus, zéro sinon', () => {
    expect(tarifDe('claude-opus-5-5')).toEqual({ entree: 4, sortie: 20, lecture: 0.2 })
    expect(coutDe('claude-haiku-5-5', { entree: 1_000_000, sortie: 1_000_000, cacheLecture: 0, cacheEcriture: 0 })).toBeCloseTo(0.6)
    expect(coutDe('claude-opus-5-5', { entree: 0, sortie: 0, cacheLecture: 1_000_000, cacheEcriture: 1_000_000 }, '1h')).toBeCloseTo(8.2)
    expect(coutDe('mistral-small', { entree: 5000, sortie: 5000, cacheLecture: 0, cacheEcriture: 0 })).toBe(0)
  })

  it('retire les blocs de réflexion des modèles locaux, même coupés en morceaux', () => {
    const f = new FiltreReflexion()
    const morceaux = ['Bon', 'jour <th', 'ink>je réfléchis', ' encore</thi', 'nk> à vous', ' < tous']
    const sortie = morceaux.map((m) => f.filtrer(m)).join('') + f.fin()
    expect(sortie).toBe('Bonjour  à vous < tous')
  })

  it('fusionne les messages consécutifs de même rôle', () => {
    const m = fusionnerMessages([{ role: 'user', contenu: 'a' }, { role: 'user', contenu: 'b' }, { role: 'assistant', contenu: 'c' }])
    expect(m).toEqual([{ role: 'user', content: 'a\n\nb' }, { role: 'assistant', content: 'c' }])
  })
})

describe('contexte du Narrateur', () => {
  const scenes = (n: number, taille = 400): SceneContexte[] =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i}`, index: i, jour: 1 + Math.floor(i / 6), action: `action ${i}`, prose: `Scène ${i}. ${'mot '.repeat(taille)}` }))

  const construire = (etat: ReturnType<typeof etatDeTest>, sc: SceneContexte[], action: string) =>
    construireNarrateur({ etat, scenes: sc, action, reglages: REGLAGES_DEFAUT, regles: REGLES_DEFAUT, gabarit: 'grand', souvenirs: [], presentsRecents: [] })

  it('garde un préfixe identique d’un tour à l’autre (condition du cache des prompts)', () => {
    const etat = etatDeTest()
    const sc = scenes(5)
    const tour1 = construire(etat, sc, 'je regarde autour de moi')
    // Entre deux tours, tout ce qui est volatil change : état, faits récents, consigne, date.
    const etat2 = structuredClone(etat)
    etat2.hero.pv -= 3
    etat2.personnages[0].resonance = 30
    etat2.personnages[0].rencontre = true
    etat2.memoire.faits.push('Un fait tout neuf.')
    etat2.memoire.scenes.push({ sceneId: 's5', jour: 1, texte: 'Résumé.' })
    etat2.calendrier.creneau = 2
    const sc2 = [...sc, { id: 's5', index: 5, jour: 1, action: 'je regarde autour de moi', prose: 'Vous regardez.' }]
    const tour2 = construire(etat2, sc2, 'je salue Séraphine')

    expect(tour2.systeme).toEqual(tour1.systeme)
    const stable1 = tour1.messages.slice(0, -1)
    expect(tour2.messages.slice(0, stable1.length).map((m) => m.contenu)).toEqual(stable1.map((m) => m.contenu))
    // Le bloc volatile, lui, n'apparaît que dans le dernier message.
    expect(tour2.messages.at(-1)!.contenu).toContain('Un fait tout neuf.')
    expect(tour2.messages.slice(0, -1).some((m) => m.contenu.includes('CONTEXTE DE JEU'))).toBe(false)
    // Trois points de cache au plus dans les messages + un dans le système.
    expect(tour2.messages.filter((m) => m.cache).length).toBeLessThanOrEqual(2)
  })

  it('interdit explicitement le mystère quand le budget ne l’autorise pas', () => {
    const etat = etatDeTest()
    const v = blocVolatile(etat, REGLES_DEFAUT, { souvenirs: [], presentsRecents: [] })
    expect(v).toContain('Mystère : INTERDIT')
    etat.rythme.totalScenes = 99
    etat.rythme.scenesDepuisIndice = 99
    etat.plan = { jour: 1, intention: '', consignes: [{ creneau: 'matin', type: 'mystere', consigne: 'x', personnages: [] }] }
    expect(blocVolatile(etat, REGLES_DEFAUT, { souvenirs: [], presentsRecents: [] })).toContain('Mystère : autorisé')
  })

  it('ne donne au Narrateur aucun chiffre de jeu', () => {
    const etat = etatDeTest()
    etat.personnages[0].resonance = 37
    etat.personnages[0].rencontre = true
    etat.hero.or = 213
    const v = blocVolatile(etat, REGLES_DEFAUT, { souvenirs: [], presentsRecents: [] })
    expect(v).not.toMatch(/37|213/)
    expect(v).toContain(lienQualitatif(37))
  })

  it('place la vérité cachée et les secrets dans la bible, et les règles de contenu dans les consignes', () => {
    const etat = etatDeTest()
    expect(bibleFixe(etat, 'grand')).toContain('concours d’entrée a été truqué')
    for (const g of ['grand', 'petit'] as const) {
      const s = systemeNarrateur(etat, 'moyenne', g)
      expect(s).toMatch(/adultes/)
      expect(s).toMatch(/aucune nudité|Aucune scène sexuelle|aucune scène sexuelle/)
      expect(s).toContain('[[JET:')
    }
    etat.preferences.romance = false
    expect(systemeNarrateur(etat, 'moyenne', 'grand')).toContain('désactivé la romance')
  })

  it('compacte la fenêtre quand elle dépasse le budget, avec hystérésis', () => {
    const etat = etatDeTest()
    const sc = scenes(40)
    expect(compacter(etat, sc.slice(0, 3), 6000)).toBeNull()
    const c = compacter(etat, sc, 6000)!
    expect(c.debutFenetre).toBeGreaterThan(0)
    expect(c.debutFenetre).toBeLessThanOrEqual(38)
    etat.memoire.debutFenetre = c.debutFenetre
    expect(compacter(etat, sc, 6000)).toBeNull() // pas de recompaction immédiate
    // Les scènes sorties de la fenêtre restent présentes par leurs résumés.
    etat.memoire.scenes = sc.map((s) => ({ sceneId: s.id, jour: s.jour, texte: `résumé ${s.index}` }))
    etat.memoire.jours = [{ jour: 1, texte: 'Journée 1 résumée.' }]
    const bloc = blocMemoire(etat, sc)
    expect(bloc).toContain('Journée 1 résumée.')
    const envoyees = construire(etat, sc, 'x').messages.filter((m) => m.role === 'assistant')
    expect(envoyees).toHaveLength(sc.length - c.debutFenetre)
  })
})

describe('recherche par similarité', () => {
  const v = new VectoriseurIntegre()
  const souvenir = (i: number, texte: string): Souvenir => ({ sceneId: `s${i}`, indexScene: i, jour: 1, texte, vecteur: v.vecteur(texte) })

  it('retrouve le passage pertinent parmi des scènes anciennes', () => {
    const base = [
      souvenir(0, 'Séraphine vous a prêté son grimoire de botanique en vous faisant promettre de le rendre avant l’examen.'),
      souvenir(1, 'Le réfectoire servait une soupe de navets. Maëlle a ri de votre grimace.'),
      souvenir(2, 'Maître Orsini vous a fait courir dix tours de cour sous la pluie.'),
      souvenir(3, 'La bibliothèque fermait ; le concierge a soufflé les lanternes une à une.'),
    ]
    const r = retrouver(v.vecteur('Je rends le grimoire à Séraphine comme promis'), base, 2, 10)
    expect(r[0].sceneId).toBe('s0')
    const r2 = retrouver(v.vecteur('Je retourne courir dans la cour avec Orsini'), base, 1, 10)
    expect(r2[0].sceneId).toBe('s2')
  })

  it('ignore les scènes encore dans la fenêtre et ce qui n’a rien à voir', () => {
    const base = [souvenir(5, 'Séraphine vous a prêté son grimoire.')]
    expect(retrouver(v.vecteur('grimoire de Séraphine'), base, 3, 5)).toHaveLength(0)
    expect(retrouver(v.vecteur('zèbre volcan parapluie'), base, 3, 10)).toHaveLength(0)
  })

  it('découpe sans perdre de texte et sérialise les vecteurs', () => {
    const texte = Array.from({ length: 12 }, (_, i) => `Paragraphe ${i} ${'x'.repeat(200)}`).join('\n\n')
    const p = decouper(texte, 700)
    expect(p.length).toBeGreaterThan(2)
    expect(p.join('\n').replace(/\n/g, '')).toBe(texte.replace(/\n/g, ''))
    const vec = v.vecteur('bonjour le monde')
    expect(Array.from(depuisBlob(versBlob(vec)))).toEqual(Array.from(vec))
  })
})
