import { describe, expect, it } from 'vitest'
import { Session } from '@core/game/session'
import { PREFERENCES_DEFAUT } from '@core/game/creation'
import { REGLES_DEFAUT } from '@core/rules/regles'
import type { Archive } from '@core/storage/depot'
import { banc, HISTOIRE } from './outils'

const HEROS = { prenom: 'Aubin', age: 19, forces: ['agilite', 'charme'] as const, faiblesse: 'force' as const }

async function nouvelle(b = banc()) {
  const session = await Session.creer(b.services, { ...PREFERENCES_DEFAUT }, { ...HEROS, forces: [...HEROS.forces] })
  return { b, session }
}

describe('création de partie', () => {
  it('génère un monde et un état initial cohérent', async () => {
    const { session, b } = await nouvelle()
    const e = session.etat
    expect(e.monde.titre).toBe('Les Cendres de Valmont')
    expect(e.personnages.filter((p) => p.role === 'heroine')).toHaveLength(2)
    expect(e.personnages.every((p) => p.age >= 18)).toBe(true)
    expect(e.personnages[0].paliers.map((p) => p.seuil)).toEqual([25, 50, 75, 100]) // paliers manquants complétés
    expect(e.factions).toHaveLength(4)
    expect(e.hero.stats.agilite).toBe(14)
    expect(e.journal[0].type).toBe('objectif')
    expect(b.depot.listerParties()).toHaveLength(1)
  })

  it('impose 18 ans minimum et nettoie le prénom', async () => {
    const b = banc()
    const s = await Session.creer(b.services, { ...PREFERENCES_DEFAUT }, { prenom: '  [[Zed]]  ', age: 12, forces: [], faiblesse: null })
    expect(s.etat.hero.age).toBe(18)
    expect(s.etat.hero.prenom).toBe('Zed')
  })

  it('refuse un monde incomplet sans créer de partie', async () => {
    const b = banc({ ...HISTOIRE, monde: { titre: 'Vide' } })
    await expect(Session.creer(b.services, { ...PREFERENCES_DEFAUT }, { ...HEROS, forces: [] })).rejects.toThrow(/incomplet/)
    expect(b.depot.listerParties()).toHaveLength(0)
  })
})

describe('tour de jeu', () => {
  it('joue la première scène : flux, enregistrement, rapport appliqué par le moteur', async () => {
    const { session, b } = await nouvelle()
    await session.commencer()
    const types = b.evenements.map((e) => e.type)
    expect(types).toContain('ligne')
    expect(types).toContain('scene-finie')
    expect(types.lastIndexOf('etat')).toBeGreaterThan(types.indexOf('scene-finie'))
    const lignes = b.evenements.filter((e) => e.type === 'ligne').map((e: any) => e.ligne.type)
    expect(lignes).toEqual(['lieu', 'narration', 'replique'])
    const e = session.etat
    expect(e.stats.scenes).toBe(1)
    expect(e.personnages[0].resonance).toBe(3)
    expect(e.personnages[0].rencontre).toBe(true)
    expect(e.personnages[0].souvenirs[0]).toContain('pas baissé les yeux')
    expect(e.pistes).toEqual(['Observer', 'Parler', 'Partir'])
    expect(e.lieux.find((l) => l.id === e.lieuActuel)?.nom).toBe('Grande Cour')
    expect(e.succes).toContain('premiers-pas')
    expect(session.historique()).toHaveLength(1)
    // L'état est persisté : une réouverture donne la même chose.
    expect(Session.ouvrir(b.services, session.partieId).etat).toEqual(e)
  })

  it('suspend la scène à un jet, résout le dé par le code, puis raconte l’issue', async () => {
    const { session, b } = await nouvelle()
    await session.commencer()
    await session.jouer('Je vais voir Maëlle.')
    expect(session.etat.jetEnAttente).toEqual({ de: 'D20', stat: 'agilite', difficulte: 12, motif: 'attraper la pomme' })
    expect(session.etat.stats.scenes).toBe(1) // pas de rapport pour une scène suspendue
    // Tant que le jet est en attente, on ne peut pas jouer autre chose.
    const avant = session.historique().length
    await session.jouer('Je fais autre chose.')
    expect(session.historique()).toHaveLength(avant)
    // Valeur impossible refusée.
    await session.lancerDe(42)
    expect(session.etat.jetEnAttente).not.toBeNull()

    await session.lancerDe(9) // 9 + 2 (agilité 14) = 11 < 12 → échec
    const resultat = session.etat.dernierJet!
    expect(resultat).toMatchObject({ valeur: 9, modificateur: 2, total: 11, reussite: false, virtuel: false })
    expect(session.etat.jetEnAttente).toBeNull()
    // Le Narrateur a reçu l'issue décidée par le code.
    const narrations = b.mock.recues.filter((r) => r.role === 'narrateur')
    expect(narrations.at(-1)!.messages.at(-1)!.contenu).toContain('RÉSULTAT DU JET')
    expect(narrations.at(-1)!.messages.at(-1)!.contenu).toContain('ÉCHEC')
    // Le Greffier a reçu les deux moitiés de la scène.
    const greffier = b.mock.recues.filter((r) => r.role === 'greffier').at(-1)!
    expect(greffier.messages[0].contenu).toContain('SCÈNE PRÉCÉDENTE')
    expect(session.etat.stats).toMatchObject({ jets: 1, jetsReussis: 0, scenes: 2 })
  })

  it('le moteur borne ce que le Greffier propose, même si le joueur triche', async () => {
    const { session } = await nouvelle()
    await session.commencer()
    await session.jouer('Je vais voir Maëlle.')
    const orAvant = session.etat.hero.or
    await session.lancerDe(null) // lancer virtuel (hasard fixé à 0.7 → 15)
    expect(session.etat.dernierJet).toMatchObject({ valeur: 15, virtuel: true, reussite: true })
    // Le rapport proposait +1000 or et +40 de Résonance.
    expect(session.etat.hero.or).toBe(orAvant + REGLES_DEFAUT.heros.gainMaxOrParScene)
    expect(session.etat.personnages[1].resonance).toBe(REGLES_DEFAUT.resonance.maxParScene)
    expect(session.etat.memoire.faits).toContain('Maëlle a offert une pomme au héros.')
  })

  it('une panne du Narrateur ne change rien et se rejoue', async () => {
    const { session, b } = await nouvelle()
    await session.commencer()
    const avant = structuredClone(session.etat)
    b.mock.echecs.add('narrateur')
    await session.jouer('Je regarde le ciel.')
    expect(b.evenements.some((e) => e.type === 'erreur')).toBe(true)
    expect(session.etat).toEqual(avant)
    expect(session.historique()).toHaveLength(1)
    expect(session.enCours).toBe(false)
    b.mock.echecs.clear()
    await session.jouer('Je regarde le ciel.')
    expect(session.historique()).toHaveLength(2)
  })

  it('une panne du Greffier laisse la scène jouée, et le rapport se relance', async () => {
    const { session, b } = await nouvelle()
    b.mock.echecs.add('greffier')
    await session.commencer()
    expect(session.historique()).toHaveLength(1)
    expect(session.etat.stats.scenes).toBe(0)
    expect(session.rapportManquant).toBe(true)
    const err = b.evenements.find((e) => e.type === 'erreur') as any
    expect(err.erreur.message).toContain('rapport a échoué')
    b.mock.echecs.clear()
    await session.reessayer()
    expect(session.rapportManquant).toBe(false)
    expect(session.etat.personnages[0].resonance).toBe(3)
  })

  it('après un jet lancé, une panne ne permet pas de relancer le dé', async () => {
    const { session, b } = await nouvelle()
    await session.commencer()
    await session.jouer('Je vais voir Maëlle.')
    b.mock.echecs.add('narrateur')
    await session.lancerDe(3)
    expect(session.etat.jetEnAttente).not.toBeNull()
    b.mock.echecs.clear()
    await session.lancerDe(20) // tentative de « relance » : le premier jet est conservé
    expect(session.etat.dernierJet?.valeur).toBe(3)
  })

  it('respecte le plafond de dépense', async () => {
    const { session, b } = await nouvelle()
    await session.commencer()
    b.depot.ajouterUsage({ fournisseur: 'x', modele: 'y', role: 'narrateur', entree: 0, sortie: 0, cacheLecture: 0, cacheEcriture: 0, cout: 5 }, session.partieId, 'session-test', 1)
    await session.jouer('Encore une scène.')
    const err = b.evenements.filter((e) => e.type === 'erreur').at(-1) as any
    expect(err.erreur.genre).toBe('plafond')
    expect(session.historique()).toHaveLength(1)
  })
})

describe('temps, nuit et mise en scène', () => {
  it('passe la nuit : résumé du jour, hors champ, opinions, plan plafonné', async () => {
    const { session, b } = await nouvelle()
    await session.commencer()
    await session.avancerTemps('jour')
    const e = session.etat
    expect(e.calendrier).toMatchObject({ jour: 2, creneau: 0 })
    expect(e.memoire.jours[0]).toMatchObject({ jour: 1, texte: 'Première journée à Hautecime.' })
    expect(e.memoire.horsChamp[0].personnage).toBe('Séraphine de Valmont')
    expect(e.personnages[1].opinion).toBe('Il attrape bien.')
    // Le Metteur en scène demandait du « mystère » dès le matin : le code le ramène au quotidien.
    expect(e.plan?.jour).toBe(2)
    expect(e.plan?.consignes[0]).toMatchObject({ creneau: 'matin', type: 'quotidien' })
    expect(b.evenements.some((x) => x.type === 'transition')).toBe(true)
    // Le Narrateur reçoit bien l'interdiction.
    await session.jouer('Je descends en cours.')
    const dernier = b.mock.recues.filter((r) => r.role === 'narrateur').at(-1)!
    expect(dernier.messages.at(-1)!.contenu).toContain('Mystère : INTERDIT')
  })

  it('survit à une nuit entièrement en panne', async () => {
    const { session, b } = await nouvelle()
    await session.commencer()
    b.mock.echecs.add('nuit').add('metteur-en-scene')
    await session.avancerTemps('jour')
    expect(session.etat.calendrier.jour).toBe(2)
    expect(session.etat.plan?.jour).toBe(2)
    expect(session.etat.memoire.jours).toHaveLength(1)
  })

  it('clôt un chapitre au bout d’une semaine', async () => {
    const { session } = await nouvelle()
    await session.commencer()
    for (let i = 0; i < 7; i++) await session.avancerTemps('jour')
    const e = session.etat
    expect(e.calendrier.jour).toBe(8)
    expect(e.rythme.chapitre).toBe(2)
    expect(e.memoire.chapitres).toHaveLength(1)
    expect(e.memoire.chronique).toContain('Hautecime')
    expect(e.memoire.jours).toHaveLength(0)
    expect(e.succes).toContain('une-semaine')
  })

  it('applique les activités de temps libre de façon déterministe', async () => {
    const { session } = await nouvelle()
    await session.commencer()
    await session.jouer('Je m’entraîne.', 'entrainement:force') // scène à jet : sans importance ici
    expect(session.etat.entrainement.force).toBe(1)
  })
})

describe('arbre des sauvegardes', () => {
  it('revient à un embranchement et ouvre une nouvelle branche', async () => {
    const { session, b } = await nouvelle()
    await session.commencer()
    const premiere = session.historique()[0].id
    const etatApresPremiere = structuredClone(session.etat)
    await session.jouer('Je vais voir Maëlle.')
    await session.lancerDe(15)
    expect(session.historique()).toHaveLength(3)

    session.revenirA(premiere)
    expect(session.etat).toEqual(etatApresPremiere)
    expect(session.historique()).toHaveLength(1)
    await session.jouer('Je pars de l’autre côté.')
    const arbre = b.depot.arbre(session.partieId)
    expect(arbre).toHaveLength(4)
    expect(arbre.filter((n) => n.surChemin)).toHaveLength(2)
    expect(arbre.filter((n) => n.parent === premiere)).toHaveLength(2) // deux branches sœurs
  })

  it('recommence l’histoire en gardant le monde', async () => {
    const { session, b } = await nouvelle()
    await session.commencer()
    b.depot.enregistrerImage(session.partieId, { cle: 'decor:x:jour', fichier: 'a.svg', prompt: '', graine: 1, fournisseur: 'procedural', creeLe: 1 })
    session.recommencer()
    expect(session.historique()).toHaveLength(0)
    expect(session.etat.stats.scenes).toBe(0)
    expect(session.etat.monde.titre).toBe('Les Cendres de Valmont')
    expect(b.depot.imagesDe(session.partieId)).toHaveLength(1) // les images sont conservées
  })

  it('exporte puis importe une partie dans un seul fichier', async () => {
    const { session, b } = await nouvelle()
    await session.commencer()
    await session.jouer('Je vais voir Maëlle.')
    b.depot.enregistrerImage(session.partieId, { cle: 'cg:1', fichier: 'cg.png', prompt: 'p', graine: 1, fournisseur: 'procedural', creeLe: 1 })
    const archive: Archive = JSON.parse(JSON.stringify(b.depot.exporter(session.partieId, () => new Uint8Array([1, 2, 3]))))
    const ecrits: string[] = []
    const id = b.depot.importer(archive, 'copie', (f, d) => { ecrits.push(`${f}:${d.length}`) }, 99)
    const copie = Session.ouvrir(b.services, id)
    expect(copie.historique().map((s) => s.prose)).toEqual(session.historique().map((s) => s.prose))
    expect(copie.etat.jetEnAttente).toEqual(session.etat.jetEnAttente)
    expect(copie.etat.id).toBe('copie')
    expect(ecrits).toEqual(['cg.png:3'])
    expect(() => b.depot.importer({ format: 'autre' } as any, 'x', () => {}, 1)).toThrow(/sauvegarde Résonance/)
    expect(b.depot.listerParties()).toHaveLength(2)
  })

  it('supprime une partie et tout ce qui s’y rattache', async () => {
    const { session, b } = await nouvelle()
    await session.commencer()
    b.depot.supprimerPartie(session.partieId)
    expect(b.depot.listerParties()).toHaveLength(0)
    expect(b.depot.arbre(session.partieId)).toHaveLength(0)
  })
})

describe('enquête et épilogue', () => {
  it('juge une déduction et fait avancer l’histoire si elle est juste', async () => {
    const { session } = await nouvelle()
    await session.commencer()
    const e = structuredClone(session.etat)
    e.journal.push({ id: 'i1', type: 'indice', texte: 'Le sceau était déjà brisé.', statut: 'actif', jour: 1 }, { id: 'i2', type: 'indice', texte: 'La liste des admis a été recopiée.', statut: 'actif', jour: 1 })
    session.etat = e
    await session.deduire(['i1'], 'x') // un seul indice : refusé
    expect(session.etat.hypotheses).toHaveLength(0)
    await session.deduire(['i1', 'i2'], 'Quelqu’un a truqué le concours.')
    expect(session.etat.hypotheses[0]).toMatchObject({ verdict: 'juste', indices: ['i1', 'i2'] })
    expect(session.etat.stats.deductionsJustes).toBe(1)
    expect(session.etat.journal.at(-1)?.texte).toBe('Aller voir la Chancelière.')
    expect(session.etat.succes).toContain('fin-limier')
  })

  it('conclut l’histoire par un épilogue', async () => {
    const { session } = await nouvelle()
    await session.commencer()
    await session.conclure()
    expect(session.etat.termine).toBe(true)
    expect(session.etat.epilogue).toContain('Hautecime')
    const n = session.historique().length
    await session.jouer('Encore ?')
    expect(session.historique()).toHaveLength(n)
  })
})
