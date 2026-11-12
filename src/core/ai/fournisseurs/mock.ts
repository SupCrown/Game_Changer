/**
 * Faux fournisseur : rejoue l'histoire de démonstration (packs/demo/histoire.json).
 * Sert à essayer le jeu sans clé ni coût, et aux tests automatiques.
 */
import { ErreurFournisseur, usageVide, type FournisseurIA, type ReponseIA, type ReponseJson, type RequeteIA, type RequeteJson, type Role } from '../types'
import { estimerJetons } from '../prose'

export interface HistoireDemo {
  monde: unknown
  scenes: { prose: string; rapport: unknown }[]
  generiques: { prose: string; rapport: unknown }[]
  nuits: unknown[]
  plans: unknown[]
  chapitre: unknown
  verdict: unknown
  epilogue: string
}

export const HISTOIRE_VIDE: HistoireDemo = {
  monde: {}, scenes: [], generiques: [], nuits: [], plans: [], chapitre: {}, verdict: {}, epilogue: '',
}

export class FournisseurMock implements FournisseurIA {
  readonly id = 'mock' as const
  readonly gabarit = 'grand' as const
  /** Rôles à faire échouer (tests de robustesse). */
  echecs = new Set<Role>()
  /** Requêtes reçues (tests). */
  recues: RequeteIA[] = []

  constructor(private histoire: HistoireDemo, private delaiMs = 14) {}

  private scene(index: number) {
    const { scenes, generiques } = this.histoire
    if (index < scenes.length) return scenes[index]
    if (generiques.length) return generiques[(index - scenes.length) % generiques.length]
    return scenes[scenes.length - 1] ?? { prose: 'La journée s’écoule sans histoire.', rapport: {} }
  }

  private verifier(req: RequeteIA) {
    this.recues.push(req)
    if (this.echecs.has(req.role)) throw new ErreurFournisseur('reseau', 'Panne simulée du fournisseur de démonstration.', true)
  }

  async ecrire(req: RequeteIA, surDelta: (texte: string) => void): Promise<ReponseIA> {
    this.verifier(req)
    const index = Number(req.meta?.index ?? 0)
    const texte = req.role === 'epilogue' ? this.histoire.epilogue || 'Ainsi s’achève cette histoire.' : this.scene(index).prose
    // On débite le texte par petits morceaux, comme un vrai flux.
    const pas = 7
    for (let i = 0; i < texte.length; i += pas) {
      if (req.signal?.aborted) throw new ErreurFournisseur('annule', 'Génération interrompue.', true)
      surDelta(texte.slice(i, i + pas))
      if (this.delaiMs > 0) await new Promise((r) => setTimeout(r, this.delaiMs))
    }
    const usage = usageVide(this.id, 'demo', req.role)
    usage.entree = estimerJetons(req.systeme.map((b) => b.texte).join('') + req.messages.map((m) => m.contenu).join(''))
    usage.sortie = estimerJetons(texte)
    return { texte, usage, arret: 'fin' }
  }

  async structurer(req: RequeteJson): Promise<ReponseJson> {
    this.verifier(req)
    if (this.delaiMs > 0) await new Promise((r) => setTimeout(r, this.delaiMs * 20))
    const h = this.histoire
    const index = Number(req.meta?.index ?? 0)
    const jour = Number(req.meta?.jour ?? 1)
    const tourner = (l: unknown[], i: number) => (l.length ? l[Math.abs(i) % l.length] : {})
    let donnees: unknown
    switch (req.role) {
      case 'greffier': donnees = this.scene(index).rapport; break
      case 'nuit': donnees = tourner(h.nuits, jour - 1); break
      // `jour` est ici le jour à planifier : le premier plan enregistré est celui du jour 2.
      case 'metteur-en-scene': donnees = tourner(h.plans, Math.max(0, jour - 2)); break
      case 'monde': donnees = h.monde; break
      case 'chapitre': donnees = h.chapitre; break
      case 'deduction': donnees = h.verdict; break
      default: donnees = {}
    }
    const usage = usageVide(this.id, 'demo', req.role)
    return { donnees, brut: JSON.stringify(donnees), usage }
  }

  async tester(): Promise<{ ok: boolean; message: string; modeles?: string[] }> {
    return { ok: true, message: 'Mode démonstration : aucune connexion nécessaire.', modeles: ['demo'] }
  }
}
