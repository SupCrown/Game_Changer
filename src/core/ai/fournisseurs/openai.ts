/**
 * Tout service exposant l'API « chat completions » d'OpenAI : LM Studio, OpenRouter, Mistral, vLLM, etc.
 * Sorties structurées : mode JSON + rappel du format dans la consigne (le plus largement accepté).
 */
import { erreurReseau, fusionnerMessages, ErreurFournisseur, FiltreReflexion, lireLignes, usageVide, type FournisseurIA, type ReponseIA, type ReponseJson, type RequeteIA, type RequeteJson } from '../types'
import { extraireJson } from '../schemas'

export class FournisseurOpenAI implements FournisseurIA {
  readonly id = 'openai' as const
  readonly gabarit: 'grand' | 'petit'
  private url: string

  constructor(url: string, private cle: string, gabarit: 'grand' | 'petit' = 'petit') {
    this.url = url.replace(/\/+$/, '')
    this.gabarit = gabarit
  }

  private entetes(): Record<string, string> {
    return { 'content-type': 'application/json', ...(this.cle ? { authorization: `Bearer ${this.cle}` } : {}) }
  }

  private messages(req: RequeteIA, suffixeSysteme = '') {
    return [
      { role: 'system', content: req.systeme.map((b) => b.texte).join('\n\n') + suffixeSysteme },
      ...fusionnerMessages(req.messages),
    ]
  }

  private async appeler(corps: unknown, signal?: AbortSignal): Promise<Response> {
    let rep: Response
    try {
      rep = await fetch(`${this.url}/chat/completions`, { method: 'POST', headers: this.entetes(), body: JSON.stringify(corps), signal })
    } catch (e) {
      throw erreurReseau(e, 'le service d’IA')
    }
    if (!rep.ok) {
      const detail = (await rep.text().catch(() => '')).slice(0, 500)
      if (rep.status === 401 || rep.status === 403) throw new ErreurFournisseur('cle', 'La clé API est refusée par ce service.', false, detail)
      if (rep.status === 429) throw new ErreurFournisseur('limite', 'Limite de débit ou de crédit atteinte chez ce service. Patientez, puis réessayez.', true, detail)
      if (rep.status === 404) throw new ErreurFournisseur('inconnu', 'Adresse ou modèle introuvable. Vérifiez l’URL et le nom du modèle.', false, detail)
      if (rep.status >= 500) throw new ErreurFournisseur('surcharge', 'Le service d’IA est momentanément indisponible.', true, detail)
      throw new ErreurFournisseur('inconnu', `Le service d’IA a répondu par une erreur (${rep.status}).`, true, detail)
    }
    return rep
  }

  async ecrire(req: RequeteIA, surDelta: (texte: string) => void): Promise<ReponseIA> {
    const rep = await this.appeler({
      model: req.modele, messages: this.messages(req), max_tokens: req.maxJetons, stream: true, stream_options: { include_usage: true },
    }, req.signal)
    const usage = usageVide(this.id, req.modele, req.role)
    const filtre = new FiltreReflexion()
    let texte = ''
    let arret: ReponseIA['arret'] = 'fin'
    try {
      for await (const ligne of lireLignes(rep.body!)) {
        if (!ligne.startsWith('data:')) continue
        const charge = ligne.slice(5).trim()
        if (charge === '[DONE]') break
        let morceau: any
        try { morceau = JSON.parse(charge) } catch { continue }
        const choix = morceau.choices?.[0]
        const d = filtre.filtrer(choix?.delta?.content ?? '')
        if (d) { texte += d; surDelta(d) }
        if (choix?.finish_reason === 'length') arret = 'longueur'
        if (morceau.usage) {
          usage.entree = morceau.usage.prompt_tokens ?? 0
          usage.sortie = morceau.usage.completion_tokens ?? 0
        }
      }
    } catch (e) {
      throw erreurReseau(e, 'le service d’IA')
    }
    const reste = filtre.fin()
    if (reste) { texte += reste; surDelta(reste) }
    if (!texte.trim()) throw new ErreurFournisseur('illisible', 'Le modèle n’a rien répondu. Réessayez.', true)
    return { texte, usage, arret }
  }

  async structurer(req: RequeteJson): Promise<ReponseJson> {
    const suffixe = `\n\nRéponds UNIQUEMENT par un objet JSON valide, sans texte autour, de cette forme :\n${req.aideFormat}`
    const corps = { model: req.modele, messages: this.messages(req, suffixe), max_tokens: req.maxJetons, stream: false }
    let rep: Response
    try {
      rep = await this.appeler({ ...corps, response_format: { type: 'json_object' } }, req.signal)
    } catch (e) {
      // Certains serveurs ne connaissent pas `response_format` : on retente sans.
      if (e instanceof ErreurFournisseur && e.genre === 'inconnu' && e.reessayable) rep = await this.appeler(corps, req.signal)
      else throw e
    }
    const json: any = await rep.json().catch(() => ({}))
    const brut = String(json.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '')
    const usage = usageVide(this.id, req.modele, req.role)
    usage.entree = json.usage?.prompt_tokens ?? 0
    usage.sortie = json.usage?.completion_tokens ?? 0
    try {
      return { donnees: extraireJson(brut), brut, usage }
    } catch (e) {
      throw new ErreurFournisseur('illisible', 'La réponse de l’IA était illisible. Vous pouvez réessayer.', true, e instanceof Error ? e.message : String(e))
    }
  }

  async tester(modele: string): Promise<{ ok: boolean; message: string; modeles?: string[] }> {
    try {
      const rep = await fetch(`${this.url}/models`, { headers: this.entetes() })
      if (rep.status === 401 || rep.status === 403) return { ok: false, message: 'La clé API est refusée par ce service.' }
      if (!rep.ok) return { ok: false, message: `Le service a répondu par une erreur (${rep.status}). Vérifiez l’adresse (elle se termine souvent par /v1).` }
      const json: any = await rep.json().catch(() => ({}))
      const modeles: string[] = (json.data ?? []).map((m: any) => String(m.id)).slice(0, 200)
      if (modele && modeles.length && !modeles.includes(modele)) {
        return { ok: false, message: `Connexion réussie, mais le modèle « ${modele} » n’est pas proposé par ce service.`, modeles }
      }
      return { ok: true, message: 'Connexion réussie.', modeles }
    } catch (e) {
      return { ok: false, message: erreurReseau(e, 'le service d’IA').message }
    }
  }
}
