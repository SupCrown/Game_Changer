/**
 * Stockage local : un fichier SQLite (module `node:sqlite`, intégré à Node et à Electron).
 * Les scènes forment un ARBRE : chaque scène porte l'état complet qui la suit, ce qui donne
 * gratuitement l'arbre des sauvegardes et le retour à un embranchement.
 */
import { DatabaseSync } from 'node:sqlite'
import type { BilanCouts, GameState, NoeudSauvegarde, PartieResume, Usage } from '@shared/types'
import type { Souvenir } from '@core/memory/vecteurs'
import { depuisBlob, versBlob } from '@core/memory/vecteurs'

export interface SceneStockee {
  id: string
  parent: string | null
  index: number
  jour: number
  creneau: number
  lieu: string
  action: string
  prose: string
  rapport: unknown | null
  marque: string | null
  creeLe: number
}

export interface ImageStockee {
  cle: string
  fichier: string
  prompt: string
  graine: number
  fournisseur: string
  creeLe: number
}

export interface Archive {
  format: 'resonance-partie'
  version: 1
  partie: { id: string; titre: string; univers: string; hero: string; tete: string | null; creeLe: number; etatInitial: string }
  scenes: (Omit<SceneStockee, 'rapport'> & { rapport: string | null; etat: string })[]
  images: (ImageStockee & { donnees: string })[]
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY, titre TEXT NOT NULL, univers TEXT NOT NULL, hero TEXT NOT NULL,
  tete TEXT, cree_le INTEGER NOT NULL, modifie_le INTEGER NOT NULL, etat_initial TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY, partie TEXT NOT NULL, parent TEXT, idx INTEGER NOT NULL, jour INTEGER NOT NULL,
  creneau INTEGER NOT NULL, lieu TEXT NOT NULL, action TEXT NOT NULL, prose TEXT NOT NULL,
  rapport TEXT, etat TEXT NOT NULL, marque TEXT, cree_le INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scenes_partie ON scenes(partie);
CREATE TABLE IF NOT EXISTS souvenirs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, partie TEXT NOT NULL, scene TEXT NOT NULL, idx INTEGER NOT NULL,
  jour INTEGER NOT NULL, texte TEXT NOT NULL, vecteur BLOB NOT NULL, vectoriseur TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS souvenirs_partie ON souvenirs(partie);
CREATE TABLE IF NOT EXISTS images (
  partie TEXT NOT NULL, cle TEXT NOT NULL, fichier TEXT NOT NULL, prompt TEXT NOT NULL, graine INTEGER NOT NULL,
  fournisseur TEXT NOT NULL, cree_le INTEGER NOT NULL, PRIMARY KEY (partie, cle)
);
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT, quand INTEGER NOT NULL, session TEXT NOT NULL, partie TEXT NOT NULL,
  role TEXT NOT NULL, fournisseur TEXT NOT NULL, modele TEXT NOT NULL, entree INTEGER NOT NULL, sortie INTEGER NOT NULL,
  cache_lecture INTEGER NOT NULL, cache_ecriture INTEGER NOT NULL, cout REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS reglages (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);
`

export class Depot {
  private db: DatabaseSync

  constructor(chemin: string) {
    this.db = new DatabaseSync(chemin)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;')
    this.db.exec(SCHEMA)
  }

  fermer(): void {
    this.db.close()
  }

  /** Exécute `f` dans une transaction : tout ou rien. */
  transaction<T>(f: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const r = f()
      this.db.exec('COMMIT')
      return r
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  // ───────────── Réglages ─────────────

  lireReglage<T>(cle: string, defaut: T): T {
    const r = this.db.prepare('SELECT valeur FROM reglages WHERE cle = ?').get(cle) as { valeur: string } | undefined
    if (!r) return defaut
    try { return JSON.parse(r.valeur) as T } catch { return defaut }
  }

  ecrireReglage(cle: string, valeur: unknown): void {
    this.db.prepare('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(cle, JSON.stringify(valeur))
  }

  // ───────────── Parties ─────────────

  creerPartie(p: { id: string; titre: string; univers: string; hero: string; etat: GameState; quand: number }): void {
    this.db.prepare('INSERT INTO parties (id, titre, univers, hero, tete, cree_le, modifie_le, etat_initial) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)')
      .run(p.id, p.titre, p.univers, p.hero, p.quand, p.quand, JSON.stringify(p.etat))
  }

  listerParties(): PartieResume[] {
    const lignes = this.db.prepare(`
      SELECT p.id, p.titre, p.univers, p.hero, p.cree_le, p.modifie_le,
             COALESCE(s.jour, 1) AS jour, COALESCE(s.idx + 1, 0) AS scenes
      FROM parties p LEFT JOIN scenes s ON s.id = p.tete ORDER BY p.modifie_le DESC`).all() as any[]
    return lignes.map((l) => ({ id: l.id, titre: l.titre, univers: l.univers, hero: l.hero, jour: l.jour, scenes: l.scenes, modifieLe: l.modifie_le, creeLe: l.cree_le }))
  }

  partieExiste(id: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM parties WHERE id = ?').get(id)
  }

  tete(partie: string): string | null {
    const r = this.db.prepare('SELECT tete FROM parties WHERE id = ?').get(partie) as { tete: string | null } | undefined
    return r?.tete ?? null
  }

  definirTete(partie: string, scene: string | null, quand: number): void {
    this.db.prepare('UPDATE parties SET tete = ?, modifie_le = ? WHERE id = ?').run(scene, quand, partie)
  }

  etatInitial(partie: string): GameState {
    const r = this.db.prepare('SELECT etat_initial FROM parties WHERE id = ?').get(partie) as { etat_initial: string } | undefined
    if (!r) throw new Error(`Partie introuvable : ${partie}`)
    return JSON.parse(r.etat_initial)
  }

  majEtatInitial(partie: string, etat: GameState): void {
    this.db.prepare('UPDATE parties SET etat_initial = ? WHERE id = ?').run(JSON.stringify(etat), partie)
  }

  /** État courant : celui de la scène de tête, ou l'état initial si aucune scène n'a été jouée. */
  etatCourant(partie: string): GameState {
    const tete = this.tete(partie)
    if (!tete) return this.etatInitial(partie)
    return this.etatDe(tete)
  }

  etatDe(scene: string): GameState {
    const r = this.db.prepare('SELECT etat FROM scenes WHERE id = ?').get(scene) as { etat: string } | undefined
    if (!r) throw new Error(`Scène introuvable : ${scene}`)
    return JSON.parse(r.etat)
  }

  supprimerPartie(id: string): void {
    this.transaction(() => {
      for (const t of ['scenes', 'souvenirs', 'images', 'usage']) this.db.prepare(`DELETE FROM ${t} WHERE partie = ?`).run(id)
      this.db.prepare('DELETE FROM parties WHERE id = ?').run(id)
    })
  }

  /** « Recommencer cette histoire » : même monde, mêmes images, plus aucune scène. */
  recommencer(partie: string, quand: number): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM scenes WHERE partie = ?').run(partie)
      this.db.prepare('DELETE FROM souvenirs WHERE partie = ?').run(partie)
      this.definirTete(partie, null, quand)
    })
  }

  // ───────────── Scènes ─────────────

  ajouterScene(s: { id: string; partie: string; parent: string | null; index: number; jour: number; creneau: number; lieu: string; action: string; prose: string; etat: GameState; quand: number }): void {
    this.transaction(() => {
      this.db.prepare('INSERT INTO scenes (id, partie, parent, idx, jour, creneau, lieu, action, prose, rapport, etat, marque, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?)')
        .run(s.id, s.partie, s.parent, s.index, s.jour, s.creneau, s.lieu, s.action, s.prose, JSON.stringify(s.etat), s.quand)
      this.definirTete(s.partie, s.id, s.quand)
    })
  }

  majScene(id: string, maj: { etat?: GameState; rapport?: unknown; marque?: string | null }): void {
    this.transaction(() => {
      if (maj.etat !== undefined) this.db.prepare('UPDATE scenes SET etat = ? WHERE id = ?').run(JSON.stringify(maj.etat), id)
      if (maj.rapport !== undefined) this.db.prepare('UPDATE scenes SET rapport = ? WHERE id = ?').run(JSON.stringify(maj.rapport), id)
      if (maj.marque !== undefined) this.db.prepare('UPDATE scenes SET marque = ? WHERE id = ?').run(maj.marque, id)
    })
  }

  private lireScenes(partie: string): SceneStockee[] {
    const lignes = this.db.prepare('SELECT id, parent, idx, jour, creneau, lieu, action, prose, rapport, marque, cree_le FROM scenes WHERE partie = ?').all(partie) as any[]
    return lignes.map((l) => ({
      id: l.id, parent: l.parent, index: l.idx, jour: l.jour, creneau: l.creneau, lieu: l.lieu, action: l.action, prose: l.prose,
      rapport: l.rapport ? JSON.parse(l.rapport) : null, marque: l.marque, creeLe: l.cree_le,
    }))
  }

  /** Chemin de la racine à la scène de tête : c'est la transcription de la partie en cours. */
  chemin(partie: string, jusqua?: string | null): SceneStockee[] {
    const toutes = new Map(this.lireScenes(partie).map((s) => [s.id, s]))
    const chemin: SceneStockee[] = []
    let courant = jusqua === undefined ? this.tete(partie) : jusqua
    const garde = new Set<string>()
    while (courant && toutes.has(courant) && !garde.has(courant)) {
      garde.add(courant)
      const s = toutes.get(courant)!
      chemin.push(s)
      courant = s.parent
    }
    return chemin.reverse()
  }

  arbre(partie: string): NoeudSauvegarde[] {
    const sur = new Set(this.chemin(partie).map((s) => s.id))
    return this.lireScenes(partie)
      .sort((a, b) => a.creeLe - b.creeLe)
      .map((s) => ({
        id: s.id, parent: s.parent, index: s.index, jour: s.jour, creneau: s.creneau, lieu: s.lieu,
        extrait: (s.action || s.prose).replace(/\[\[[^\]]*\]\]/g, '').trim().slice(0, 90),
        creeLe: s.creeLe, surChemin: sur.has(s.id), marque: s.marque ?? undefined,
      }))
  }

  // ───────────── Souvenirs (recherche par similarité) ─────────────

  ajouterSouvenirs(partie: string, scene: string, index: number, jour: number, items: { texte: string; vecteur: Float32Array }[], vectoriseur: string): void {
    if (!items.length) return
    this.transaction(() => {
      const req = this.db.prepare('INSERT INTO souvenirs (partie, scene, idx, jour, texte, vecteur, vectoriseur) VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const it of items) req.run(partie, scene, index, jour, it.texte, versBlob(it.vecteur), vectoriseur)
    })
  }

  souvenirs(partie: string, scenes: Set<string>, vectoriseur: string): Souvenir[] {
    const lignes = this.db.prepare('SELECT scene, idx, jour, texte, vecteur FROM souvenirs WHERE partie = ? AND vectoriseur = ?').all(partie, vectoriseur) as any[]
    return lignes.filter((l) => scenes.has(l.scene)).map((l) => ({
      sceneId: l.scene, indexScene: l.idx, jour: l.jour, texte: l.texte, vecteur: depuisBlob(l.vecteur as Uint8Array),
    }))
  }

  // ───────────── Images ─────────────

  image(partie: string, cle: string): ImageStockee | null {
    const l = this.db.prepare('SELECT cle, fichier, prompt, graine, fournisseur, cree_le FROM images WHERE partie = ? AND cle = ?').get(partie, cle) as any
    return l ? { cle: l.cle, fichier: l.fichier, prompt: l.prompt, graine: l.graine, fournisseur: l.fournisseur, creeLe: l.cree_le } : null
  }

  enregistrerImage(partie: string, i: ImageStockee): void {
    this.db.prepare(`INSERT INTO images (partie, cle, fichier, prompt, graine, fournisseur, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(partie, cle) DO UPDATE SET fichier = excluded.fichier, prompt = excluded.prompt, graine = excluded.graine, fournisseur = excluded.fournisseur, cree_le = excluded.cree_le`)
      .run(partie, i.cle, i.fichier, i.prompt, i.graine, i.fournisseur, i.creeLe)
  }

  imagesDe(partie: string): ImageStockee[] {
    const lignes = this.db.prepare('SELECT cle, fichier, prompt, graine, fournisseur, cree_le FROM images WHERE partie = ?').all(partie) as any[]
    return lignes.map((l) => ({ cle: l.cle, fichier: l.fichier, prompt: l.prompt, graine: l.graine, fournisseur: l.fournisseur, creeLe: l.cree_le }))
  }

  supprimerImage(partie: string, cle: string): void {
    this.db.prepare('DELETE FROM images WHERE partie = ? AND cle = ?').run(partie, cle)
  }

  // ───────────── Usage et coûts ─────────────

  ajouterUsage(u: Usage, partie: string, session: string, quand: number): void {
    this.db.prepare('INSERT INTO usage (quand, session, partie, role, fournisseur, modele, entree, sortie, cache_lecture, cache_ecriture, cout) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(quand, session, partie, u.role, u.fournisseur, u.modele, u.entree, u.sortie, u.cacheLecture, u.cacheEcriture, u.cout)
  }

  coutSession(session: string): number {
    return (this.db.prepare('SELECT COALESCE(SUM(cout), 0) AS c FROM usage WHERE session = ?').get(session) as any).c
  }

  coutPartie(partie: string): number {
    return (this.db.prepare('SELECT COALESCE(SUM(cout), 0) AS c FROM usage WHERE partie = ?').get(partie) as any).c
  }

  bilan(partie: string, session: string, plafonds: { session: number; partie: number }): BilanCouts {
    const total = (this.db.prepare('SELECT COALESCE(SUM(cout), 0) AS c FROM usage').get() as any).c as number
    const parRole = (this.db.prepare(`SELECT role, SUM(cout) AS cout, COUNT(*) AS appels, SUM(entree) AS entree, SUM(sortie) AS sortie, SUM(cache_lecture) AS lecture, SUM(cache_ecriture) AS ecriture
      FROM usage WHERE partie = ? AND role NOT LIKE 'image%' GROUP BY role ORDER BY cout DESC`).all(partie) as any[])
    const images = (this.db.prepare(`SELECT COALESCE(SUM(cout), 0) AS c FROM usage WHERE partie = ? AND role LIKE 'image%'`).get(partie) as any).c as number
    const lus = parRole.reduce((n, r) => n + r.lecture, 0)
    const entrants = parRole.reduce((n, r) => n + r.entree + r.lecture + r.ecriture, 0)
    return {
      session: this.coutSession(session),
      partie: this.coutPartie(partie),
      total,
      parRole: parRole.map((r) => ({ role: r.role, cout: r.cout, appels: r.appels, entree: r.entree + r.ecriture, sortie: r.sortie, cacheLecture: r.lecture })),
      images,
      tauxCache: entrants > 0 ? lus / entrants : 0,
      plafondSession: plafonds.session,
      plafondPartie: plafonds.partie,
    }
  }

  // ───────────── Export / import ─────────────

  exporter(partie: string, lireFichier: (fichier: string) => Uint8Array | null): Archive {
    const p = this.db.prepare('SELECT id, titre, univers, hero, tete, cree_le, etat_initial FROM parties WHERE id = ?').get(partie) as any
    if (!p) throw new Error('Partie introuvable.')
    const scenes = this.db.prepare('SELECT id, parent, idx, jour, creneau, lieu, action, prose, rapport, etat, marque, cree_le FROM scenes WHERE partie = ?').all(partie) as any[]
    const images = this.imagesDe(partie).flatMap((i) => {
      const d = lireFichier(i.fichier)
      return d ? [{ ...i, donnees: Buffer.from(d).toString('base64') }] : []
    })
    return {
      format: 'resonance-partie', version: 1,
      partie: { id: p.id, titre: p.titre, univers: p.univers, hero: p.hero, tete: p.tete, creeLe: p.cree_le, etatInitial: p.etat_initial },
      scenes: scenes.map((s) => ({ id: s.id, parent: s.parent, index: s.idx, jour: s.jour, creneau: s.creneau, lieu: s.lieu, action: s.action, prose: s.prose, rapport: s.rapport, etat: s.etat, marque: s.marque, creeLe: s.cree_le })),
      images,
    }
  }

  /** Importe une archive sous un nouvel identifiant de partie. Renvoie cet identifiant. */
  importer(a: Archive, nouvelId: string, ecrireFichier: (fichier: string, donnees: Uint8Array) => void, quand: number): string {
    if (a?.format !== 'resonance-partie' || a.version !== 1 || !a.partie || !Array.isArray(a.scenes)) {
      throw new Error('Ce fichier n’est pas une sauvegarde Résonance valide.')
    }
    // Vérifie que l'état initial est lisible avant d'écrire quoi que ce soit.
    const etatInitial = JSON.parse(a.partie.etatInitial) as GameState
    etatInitial.id = nouvelId
    const renommer = (id: string | null) => (id ? `${nouvelId}:${id.split(':').pop()}` : null)
    this.transaction(() => {
      this.db.prepare('INSERT INTO parties (id, titre, univers, hero, tete, cree_le, modifie_le, etat_initial) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(nouvelId, a.partie.titre, a.partie.univers, a.partie.hero, renommer(a.partie.tete), a.partie.creeLe, quand, JSON.stringify(etatInitial))
      const req = this.db.prepare('INSERT INTO scenes (id, partie, parent, idx, jour, creneau, lieu, action, prose, rapport, etat, marque, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      for (const s of a.scenes) {
        const etat = JSON.parse(s.etat) as GameState
        etat.id = nouvelId
        req.run(renommer(s.id), nouvelId, renommer(s.parent), s.index, s.jour, s.creneau, s.lieu, s.action, s.prose, s.rapport, JSON.stringify(etat), s.marque, s.creeLe)
      }
      for (const i of a.images ?? []) {
        ecrireFichier(i.fichier, Buffer.from(i.donnees, 'base64'))
        this.enregistrerImage(nouvelId, { cle: i.cle, fichier: i.fichier, prompt: i.prompt, graine: i.graine, fournisseur: i.fournisseur, creeLe: i.creeLe })
      }
    })
    return nouvelId
  }
}
