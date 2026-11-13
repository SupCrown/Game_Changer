/**
 * Moteur de règles : l'IA propose, le moteur dispose.
 * Toute modification chiffrée de l'état passe par ici, est bornée, et peut être refusée.
 */
import type { GameState, Notification, Personnage, Faction, Palier, EntreeJournal } from '@shared/types'
import { sansAccents, type RapportScene, type Changement } from '@core/ai/schemas'
import type { Regles } from './regles'

export interface ResultatApplication {
  etat: GameState
  notifications: Notification[]
  /** Propositions refusées ou rabotées, pour le panneau de développement. */
  refus: string[]
}

const borne = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/** Retrouve une entité par son nom, en tolérant accents, casse, titres et prénoms seuls. */
export function trouverParNom<T extends { nom: string; id: string }>(liste: T[], nom: string): T | undefined {
  const n = sansAccents(nom)
  if (!n) return undefined
  const exact = liste.find((x) => sansAccents(x.nom) === n || x.id === nom)
  if (exact) return exact
  const mots = (s: string) => sansAccents(s).split(/[\s'’-]+/).filter((m) => m.length > 2)
  const cible = mots(nom)
  let meilleur: T | undefined
  let score = 0
  for (const x of liste) {
    const m = mots(x.nom)
    const communs = cible.filter((c) => m.includes(c)).length
    if (communs > score) {
      score = communs
      meilleur = x
    }
  }
  return score > 0 ? meilleur : undefined
}

export function identifiant(prefixe: string, nom: string, existants: { id: string }[]): string {
  const base = `${prefixe}-${sansAccents(nom).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'x'}`
  let id = base
  let i = 2
  while (existants.some((e) => e.id === id)) id = `${base}-${i++}`
  return id
}

export function statutFaction(f: Faction, regles: Regles): 'hostile' | 'neutre' | 'protectrice' {
  if (f.reputation <= regles.reputation.hostile) return 'hostile'
  if (f.reputation >= regles.reputation.protecteur) return 'protectrice'
  return 'neutre'
}

function debloquerPaliers(p: Personnage, avant: number, etat: GameState, notes: Notification[]) {
  for (const palier of [...p.paliers].sort((a, b) => a.seuil - b.seuil)) {
    if (avant < palier.seuil && p.resonance >= palier.seuil && !p.paliersDebloques.includes(palier.seuil)) {
      p.paliersDebloques.push(palier.seuil)
      etat.hero.capacites.push({
        id: `res-${p.id}-${palier.seuil}`,
        nom: palier.nom,
        description: `${palier.description} (Résonance avec ${p.nom})`,
        source: 'resonance',
        coutMana: palier.seuil === 50 ? 4 : palier.seuil === 100 ? 8 : undefined,
      })
      p.moments.push({ jour: etat.calendrier.jour, texte: `Palier ${palier.seuil} atteint : ${palier.nom}.` })
      notes.push({ genre: 'palier', texte: `Résonance ${palier.seuil} avec ${p.nom} — ${typePalier(palier)} : ${palier.nom}`, cible: p.id })
    }
  }
}

export function typePalier(p: Pick<Palier, 'seuil'>): string {
  return p.seuil === 25 ? 'bonus passif' : p.seuil === 50 ? 'technique combinée' : p.seuil === 75 ? 'levier politique' : 'capacité unique'
}

/**
 * Applique les changements proposés par le Greffier.
 * Bornes cumulées par scène et par cible ; ce qui dépasse est raboté et consigné dans `refus`.
 */
export function appliquerChangements(source: GameState, changements: Changement[], regles: Regles): ResultatApplication {
  const etat: GameState = structuredClone(source)
  const notes: Notification[] = []
  const refus: string[] = []
  const cumul = new Map<string, number>()
  let objetsAjoutes = 0

  /** Rabote `delta` pour que le cumul de la clé reste dans [min, max]. */
  const raboter = (cle: string, delta: number, min: number, max: number): number => {
    const deja = cumul.get(cle) ?? 0
    const voulu = deja + delta
    const permis = borne(voulu, min, max)
    cumul.set(cle, permis)
    return permis - deja
  }

  for (const c of changements) {
    const delta = Math.round(c.delta)
    if (!delta) continue
    switch (c.type) {
      case 'resonance': {
        const p = trouverParNom(etat.personnages.filter((x) => x.role === 'heroine'), c.cible)
        if (!p) { refus.push(`Résonance : « ${c.cible} » n'est pas une héroïne connue.`); break }
        const d = raboter(`res:${p.id}`, delta, regles.resonance.minParScene, regles.resonance.maxParScene)
        if (d !== delta) refus.push(`Résonance ${p.nom} : ${delta} raboté à ${d}.`)
        if (!d) break
        const avant = p.resonance
        p.resonance = borne(p.resonance + d, 0, 100)
        const reel = p.resonance - avant
        if (!reel) break
        p.rencontre = true
        notes.push({ genre: 'resonance', texte: `${p.nom} : Résonance ${reel > 0 ? '+' : ''}${reel}`, delta: reel, cible: p.id })
        if (Math.abs(reel) >= 4 && c.motif) p.moments.push({ jour: etat.calendrier.jour, texte: c.motif })
        debloquerPaliers(p, avant, etat, notes)
        // Résonances opposées : la jalousie n'existe qu'entre deux liens déjà forts.
        if (reel > 0 && p.resonance >= regles.resonance.seuilJalousie) {
          for (const idRivale of p.rivales) {
            const r = etat.personnages.find((x) => x.id === idRivale)
            if (!r || r.resonance < regles.resonance.seuilJalousie) continue
            const perte = Math.max(1, Math.round(reel * regles.resonance.partJalousie))
            const avantR = r.resonance
            r.resonance = borne(r.resonance - perte, 0, 100)
            if (r.resonance !== avantR) {
              notes.push({ genre: 'resonance', texte: `${r.nom} : Résonance ${r.resonance - avantR} (elle a remarqué votre proximité avec ${p.nom})`, delta: r.resonance - avantR, cible: r.id })
            }
          }
        }
        break
      }
      case 'reputation': {
        const f = trouverParNom(etat.factions, c.cible)
        if (!f) { refus.push(`Réputation : faction « ${c.cible} » inconnue.`); break }
        const d = raboter(`rep:${f.id}`, delta, -regles.reputation.maxParScene, regles.reputation.maxParScene)
        if (d !== delta) refus.push(`Réputation ${f.nom} : ${delta} raboté à ${d}.`)
        if (!d) break
        const avant = statutFaction(f, regles)
        const v = f.reputation
        f.reputation = borne(f.reputation + d, -100, 100)
        if (f.reputation === v) break
        notes.push({ genre: 'reputation', texte: `${f.nom} : réputation ${f.reputation - v > 0 ? '+' : ''}${f.reputation - v}`, delta: f.reputation - v, cible: f.id })
        const apres = statutFaction(f, regles)
        if (apres !== avant) {
          const msg = apres === 'hostile' ? `${f.nom} agit désormais contre vous.`
            : apres === 'protectrice' ? `${f.nom} vous accorde désormais sa protection.`
            : `${f.nom} redevient neutre à votre égard.`
          notes.push({ genre: 'info', texte: msg, cible: f.id })
        }
        break
      }
      case 'pv': {
        const d = raboter('pv', delta, -regles.heros.perteMaxPvParScene, etat.hero.pvMax)
        if (d !== delta) refus.push(`PV : ${delta} raboté à ${d}.`)
        const v = etat.hero.pv
        etat.hero.pv = borne(v + d, 0, etat.hero.pvMax)
        if (etat.hero.pv !== v) notes.push({ genre: 'pv', texte: `PV ${etat.hero.pv - v > 0 ? '+' : ''}${etat.hero.pv - v}`, delta: etat.hero.pv - v })
        if (etat.hero.pv === 0 && !etat.hero.etats.includes('Inconscient')) {
          etat.hero.etats.push('Inconscient')
          notes.push({ genre: 'etat', texte: 'Vous perdez connaissance.' })
        }
        break
      }
      case 'mana': {
        const v = etat.hero.mana
        etat.hero.mana = borne(v + delta, 0, etat.hero.manaMax)
        if (etat.hero.mana !== v) notes.push({ genre: 'mana', texte: `Mana ${etat.hero.mana - v > 0 ? '+' : ''}${etat.hero.mana - v}`, delta: etat.hero.mana - v })
        break
      }
      case 'or': {
        let d = delta
        if (d > 0) {
          d = raboter('or', d, -Infinity, regles.heros.gainMaxOrParScene)
          if (d !== delta) refus.push(`Or : gain de ${delta} raboté à ${d} (plafond par scène).`)
        } else if (etat.hero.or + d < 0) {
          refus.push(`Or : dépense de ${-d} refusée, bourse insuffisante (${etat.hero.or}).`)
          notes.push({ genre: 'refus', texte: `Vous n'avez pas assez d'or (${etat.hero.or}).` })
          break
        }
        if (!d) break
        etat.hero.or += d
        notes.push({ genre: 'or', texte: `Or ${d > 0 ? '+' : ''}${d}`, delta: d })
        break
      }
      case 'objet': {
        const nom = c.cible.trim()
        if (!nom) break
        const existant = etat.hero.inventaire.find((o) => sansAccents(o.nom) === sansAccents(nom))
        if (delta > 0) {
          if (objetsAjoutes >= regles.heros.objetsMaxParScene) { refus.push(`Objet « ${nom} » refusé : trop d'objets dans une seule scène.`); break }
          objetsAjoutes++
          const q = Math.min(delta, 9)
          if (existant) existant.quantite += q
          else etat.hero.inventaire.push({ nom: nom.slice(0, 60), description: c.motif.slice(0, 200), quantite: q })
          notes.push({ genre: 'objet', texte: `Objet obtenu : ${nom}${q > 1 ? ` ×${q}` : ''}` })
        } else {
          if (!existant) { refus.push(`Objet « ${nom} » : le héros ne le possède pas.`); break }
          existant.quantite += delta
          if (existant.quantite <= 0) etat.hero.inventaire = etat.hero.inventaire.filter((o) => o !== existant)
          notes.push({ genre: 'objet', texte: `Objet perdu : ${nom}` })
        }
        break
      }
      case 'etat': {
        const nom = c.cible.trim()
        if (!nom) break
        const i = etat.hero.etats.findIndex((e) => sansAccents(e) === sansAccents(nom))
        if (delta > 0 && i < 0 && etat.hero.etats.length < 6) {
          etat.hero.etats.push(nom.slice(0, 40))
          notes.push({ genre: 'etat', texte: `Nouvel état : ${nom}` })
        } else if (delta < 0 && i >= 0) {
          etat.hero.etats.splice(i, 1)
          notes.push({ genre: 'etat', texte: `État dissipé : ${nom}` })
        }
        break
      }
    }
  }
  return { etat, notifications: notes, refus }
}

/** Journal, codex, nouveaux personnages et lieux : la partie « non chiffrée » du rapport. */
export function appliquerDecouvertes(source: GameState, rapport: RapportScene): { etat: GameState; notifications: Notification[] } {
  const etat: GameState = structuredClone(source)
  const notes: Notification[] = []
  const jour = etat.calendrier.jour

  for (const j of rapport.journal) {
    const doublon = etat.journal.some((e) => sansAccents(e.texte) === sansAccents(j.texte))
    if (doublon) continue
    const entree: EntreeJournal = { id: `j${etat.journal.length + 1}-${jour}`, type: j.type, texte: j.texte.slice(0, 300), statut: 'actif', jour }
    etat.journal.push(entree)
    notes.push({ genre: 'journal', texte: `${j.type === 'objectif' ? 'Nouvel objectif' : j.type === 'indice' ? 'Indice noté' : 'Rumeur'} : ${j.texte}` })
  }
  for (const texte of rapport.objectifsAccomplis) {
    const cible = sansAccents(texte)
    const obj = etat.journal.find((e) => e.type === 'objectif' && e.statut === 'actif' && (sansAccents(e.texte) === cible || sansAccents(e.texte).includes(cible) || cible.includes(sansAccents(e.texte))))
    if (obj) {
      obj.statut = 'accompli'
      notes.push({ genre: 'journal', texte: `Objectif accompli : ${obj.texte}` })
    }
  }

  for (const nom of rapport.presents) {
    const p = trouverParNom(etat.personnages, nom)
    // Pas de notification : la rencontre se lit dans la scène, et le codex la consigne.
    if (p && !p.rencontre) p.rencontre = true
  }
  for (const n of rapport.nouveauxPersonnages) {
    if (trouverParNom(etat.personnages, n.nom) || etat.personnages.length >= 40) continue
    etat.personnages.push({
      id: identifiant('p', n.nom, etat.personnages), nom: n.nom.slice(0, 60), role: 'secondaire', age: 25, archetype: '',
      description: n.description.slice(0, 400), apparence: n.apparence.slice(0, 400), personnalite: '', voix: '',
      objectifs: [], secrets: [], arc: { titre: '', etapes: [], etape: 0 }, opinion: '', souvenirs: [], resonance: 0,
      paliers: [], paliersDebloques: [], rivales: [], statut: 'vivant', rencontre: true, couleur: '#9aa7b8',
      graine: Math.abs(hash(n.nom)), moments: [],
    })
    notes.push({ genre: 'codex', texte: `Rencontre : ${n.nom}` })
  }

  if (rapport.lieu) {
    let lieu = trouverParNom(etat.lieux, rapport.lieu)
    if (!lieu && etat.lieux.length < 60) {
      lieu = { id: identifiant('l', rapport.lieu, etat.lieux), nom: rapport.lieu.slice(0, 60), description: '', type: rapport.typeLieu, decouvert: true }
      etat.lieux.push(lieu)
    }
    if (lieu) {
      if (!lieu.decouvert) { lieu.decouvert = true; notes.push({ genre: 'codex', texte: `Lieu découvert : ${lieu.nom}` }) }
      etat.lieuActuel = lieu.id
    }
  }

  for (const c of rapport.codex) {
    const existe = etat.codex.find((e) => sansAccents(e.titre) === sansAccents(c.titre))
    if (existe) {
      if (!existe.texte.includes(c.texte)) existe.texte = `${existe.texte}\n${c.texte}`.slice(0, 1200)
    } else if (etat.codex.length < 200) {
      etat.codex.push({ id: `c${etat.codex.length + 1}`, categorie: c.categorie, titre: c.titre.slice(0, 80), texte: c.texte.slice(0, 600), jour })
      notes.push({ genre: 'codex', texte: `Codex : ${c.titre}` })
    }
  }

  for (const s of rapport.souvenirs) {
    const p = trouverParNom(etat.personnages, s.personnage)
    if (!p) continue
    p.souvenirs.push(`J${jour} — ${s.texte.slice(0, 220)}`)
    if (p.souvenirs.length > 40) p.souvenirs.splice(0, p.souvenirs.length - 40)
  }
  return { etat, notifications: notes }
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

/** Garde-fous gratuits : incohérences détectables sans IA. */
export function incoherencesEvidentes(etat: GameState, locuteurs: string[]): string[] {
  const pb: string[] = []
  for (const nom of new Set(locuteurs)) {
    const p = trouverParNom(etat.personnages, nom)
    if (p?.statut === 'mort') pb.push(`${p.nom} est mort·e et ne peut pas parler dans cette scène.`)
    if (sansAccents(nom) === sansAccents(etat.hero.prenom)) pb.push(`Le Narrateur a fait parler le héros (${etat.hero.prenom}) à la place du joueur.`)
  }
  return pb
}
