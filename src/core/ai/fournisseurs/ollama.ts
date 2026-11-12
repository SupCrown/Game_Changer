/**
 * Ollama : IA locale, hors ligne, gratuite. API HTTP documentée sur docs.ollama.com (/api/chat, /api/embed, /api/tags).
 * Les modèles locaux étant plus modestes, ce fournisseur se déclare de gabarit « petit » :
 * le jeu lui envoie des consignes plus courtes et un contexte réduit.
 */
import { z } from 'zod'
import { erreurReseau, fusionnerMessages, ErreurFournisseur, FiltreReflexion, lireLignes, usageVide, type FournisseurIA, type ReponseIA, type ReponseJson, type RequeteIA, type RequeteJson } from '../types'
import { extraireJson } from '../schemas'

export class FournisseurOllama implements FournisseurIA {
  readonly id = 'ollama' as const
  readonly gabarit = 'petit' as const
  private url: string

  constructor(url: string, private contexte = 8192) {
    this.url = url.replace(/\/+$/, '')
  }

  private corps(req: RequeteIA, flux: boolean) {
    return {
      model: req.modele,
      stream: flux,
      messages: [
        { role: 'system', content: req.systeme.map((b) => b.texte).join('\n\n') },
        ...fusionnerMessages(req.messages),
      ],
      options: { num_ctx: this.contexte, num_predict: req.maxJetons },
      keep_alive: '30m',
    }
  }

  private async appeler(chemin: string, corps: unknown, signal?: AbortSignal): Promise<Response> {
    let rep: Response
    try {
      rep = await fetch(`${this.url}${chemin}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps), signal })
    } catch (e) {
      throw erreurReseau(e, 'Ollama')
    }
    if (!rep.ok) {
      const detail = await rep.text().catch(() => '')
      if (rep.status === 404) {
        throw new ErreurFournisseur('inconnu', 'Ce modèle n’est pas installé dans Ollama. Installez-le avec « ollama pull <modèle> ».', false, detail)
      }
      throw new ErreurFournisseur('inconnu', `Ollama a répondu par une erreur (${rep.status}).`, true, detail)
    }
    return rep
  }

  async ecrire(req: RequeteIA, surDelta: (texte: string) => void): Promise<ReponseIA> {
    const rep = await this.appeler('/api/chat', this.corps(req, true), req.signal)
    const usage = usageVide(this.id, req.modele, req.role)
    const filtre = new FiltreReflexion()
    let texte = ''
    let arret: ReponseIA['arret'] = 'fin'
    try {
      for await (const ligne of lireLignes(rep.body!)) {
        let morceau: any
        try { morceau = JSON.parse(ligne) } catch { continue }
        if (morceau.error) throw new ErreurFournisseur('inconnu', 'Ollama a signalé une erreur pendant la génération.', true, String(morceau.error))
        const d = filtre.filtrer(morceau.message?.content ?? '')
        if (d) { texte += d; surDelta(d) }
        if (morceau.done) {
          usage.entree = morceau.prompt_eval_count ?? 0
          usage.sortie = morceau.eval_count ?? 0
          if (morceau.done_reason === 'length') arret = 'longueur'
        }
      }
    } catch (e) {
      throw erreurReseau(e, 'Ollama')
    }
    const reste = filtre.fin()
    if (reste) { texte += reste; surDelta(reste) }
    if (!texte.trim()) throw new ErreurFournisseur('illisible', 'Le modèle local n’a rien répondu. Réessayez, ou choisissez un modèle plus grand.', true)
    return { texte, usage, arret }
  }

  async structurer(req: RequeteJson): Promise<ReponseJson> {
    const corps = { ...this.corps(req, false), format: z.toJSONSchema(req.schema) }
    const rep = await this.appeler('/api/chat', corps, req.signal)
    const json: any = await rep.json().catch(() => ({}))
    const brut: string = String(json.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '')
    const usage = usageVide(this.id, req.modele, req.role)
    usage.entree = json.prompt_eval_count ?? 0
    usage.sortie = json.eval_count ?? 0
    try {
      return { donnees: extraireJson(brut), brut, usage }
    } catch (e) {
      throw new ErreurFournisseur('illisible', 'Le modèle local a renvoyé une réponse illisible.', true, e instanceof Error ? e.message : String(e))
    }
  }

  async tester(modele: string): Promise<{ ok: boolean; message: string; modeles?: string[] }> {
    try {
      const rep = await fetch(`${this.url}/api/tags`)
      if (!rep.ok) return { ok: false, message: `Ollama a répondu par une erreur (${rep.status}).` }
      const json: any = await rep.json()
      const modeles: string[] = (json.models ?? []).map((m: any) => String(m.name))
      if (!modeles.length) return { ok: false, message: 'Ollama est lancé, mais aucun modèle n’est installé. Exemple : « ollama pull mistral-small ».', modeles }
      if (modele && !modeles.some((m) => m === modele || m.split(':')[0] === modele)) {
        return { ok: false, message: `Ollama est lancé, mais le modèle « ${modele} » n’est pas installé.`, modeles }
      }
      return { ok: true, message: `Connexion à Ollama réussie (${modeles.length} modèle${modeles.length > 1 ? 's' : ''}).`, modeles }
    } catch (e) {
      return { ok: false, message: erreurReseau(e, 'Ollama').message }
    }
  }

  /** Vecteurs sémantiques (pour la recherche par similarité). */
  async vectoriser(modele: string, textes: string[]): Promise<number[][]> {
    const rep = await this.appeler('/api/embed', { model: modele, input: textes })
    const json: any = await rep.json()
    if (!Array.isArray(json.embeddings)) throw new ErreurFournisseur('illisible', 'Ollama n’a pas renvoyé de vecteurs.', true)
    return json.embeddings
  }
}
