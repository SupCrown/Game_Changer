/**
 * Claude via l'API d'Anthropic (SDK officiel).
 * - streaming pour la narration ;
 * - cache des prompts : les blocs marqués `cache` reçoivent un point de cache (4 au maximum) ;
 * - sorties structurées contraintes par schéma pour le Greffier et consorts ;
 * - repli côté serveur en cas de refus du modèle (`fallbacks: "default"`).
 * La clé n'est jamais journalisée : elle ne vit que dans l'instance du client.
 */
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { Usage } from '@shared/types'
import { coutDe, ErreurFournisseur, type FournisseurIA, type ReponseIA, type ReponseJson, type RequeteIA, type RequeteJson } from '../types'
import { extraireJson } from '../schemas'

const BETA_REPLI = 'server-side-fallback-2026-07-01'
const MAX_POINTS_CACHE = 4

/** Les modèles récents acceptent le réglage d'effort ; les anciens le rejettent. */
function accepteEffort(modele: string): boolean {
  return /^claude-(fable|mythos)-5|^claude-opus-(5|4-[5678])|^claude-sonnet-(5|4-6)|^claude-haiku-5/.test(modele)
}

export class FournisseurAnthropic implements FournisseurIA {
  readonly id = 'anthropic' as const
  readonly gabarit = 'grand' as const
  private client: Anthropic
  private repli = true

  constructor(cle: string) {
    this.client = new Anthropic({ apiKey: cle, maxRetries: 2 })
  }

  private parametres(req: RequeteIA) {
    // Les points de cache sont comptés depuis la fin : on garde les plus récents si l'appelant en a trop mis.
    let restants = MAX_POINTS_CACHE - req.systeme.filter((b) => b.cache).length
    const marques = new Set<number>()
    for (let i = req.messages.length - 1; i >= 0 && restants > 0; i--) {
      if (req.messages[i].cache) { marques.add(i); restants-- }
    }
    const cache = (actif: boolean | undefined) =>
      actif ? { cache_control: { type: 'ephemeral' as const, ...(req.ttl === '1h' ? { ttl: '1h' as const } : {}) } } : {}
    return {
      model: req.modele,
      max_tokens: req.maxJetons,
      system: req.systeme.filter((b) => b.texte.trim()).map((b) => ({ type: 'text' as const, text: b.texte, ...cache(b.cache) })),
      messages: req.messages.map((m, i) => ({
        role: m.role,
        content: [{ type: 'text' as const, text: m.contenu || '…', ...cache(marques.has(i)) }],
      })),
      ...(req.effort && accepteEffort(req.modele) ? { output_config: { effort: req.effort } } : {}),
    }
  }

  private usage(req: RequeteIA, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): Usage {
    const base = {
      entree: u.input_tokens ?? 0,
      sortie: u.output_tokens ?? 0,
      cacheLecture: u.cache_read_input_tokens ?? 0,
      cacheEcriture: u.cache_creation_input_tokens ?? 0,
    }
    return { fournisseur: this.id, modele: req.modele, role: req.role, ...base, cout: coutDe(req.modele, base, req.ttl) }
  }

  async ecrire(req: RequeteIA, surDelta: (texte: string) => void): Promise<ReponseIA> {
    const p = this.parametres(req)
    let emis = false
    const delta = (t: string) => { emis = true; surDelta(t) }
    const texteDe = (blocs: { type: string; text?: string }[]) => blocs.map((b) => (b.type === 'text' ? b.text ?? '' : '')).join('')
    const lancer = async (avecRepli: boolean) => {
      if (avecRepli) {
        const flux = this.client.beta.messages.stream({ ...p, betas: [BETA_REPLI], fallbacks: 'default' }, { signal: req.signal })
        flux.on('text', delta)
        const m = await flux.finalMessage()
        return { arret: m.stop_reason, usage: m.usage, texte: texteDe(m.content) }
      }
      const flux = this.client.messages.stream(p, { signal: req.signal })
      flux.on('text', delta)
      const m = await flux.finalMessage()
      return { arret: m.stop_reason, usage: m.usage, texte: texteDe(m.content) }
    }
    try {
      let msg
      try {
        msg = await lancer(this.repli)
      } catch (e) {
        // Certains comptes ou modèles n'acceptent pas le repli serveur : on réessaie une fois sans, puis on s'en souvient.
        if (this.repli && !emis && e instanceof Anthropic.BadRequestError) {
          this.repli = false
          msg = await lancer(false)
        } else throw e
      }
      if (msg.arret === 'refusal') {
        throw new ErreurFournisseur('refus', 'Le modèle a refusé d’écrire cette scène. Reformulez votre action, ou réessayez.', true)
      }
      return { texte: msg.texte, usage: this.usage(req, msg.usage), arret: msg.arret === 'max_tokens' ? 'longueur' : 'fin' }
    } catch (e) {
      throw traduire(e)
    }
  }

  async structurer(req: RequeteJson): Promise<ReponseJson> {
    const p = this.parametres(req)
    try {
      const msg = await this.client.messages.parse(
        { ...p, output_config: { ...(p.output_config ?? {}), format: zodOutputFormat(req.schema) } },
        { signal: req.signal },
      )
      if (msg.stop_reason === 'refusal') {
        throw new ErreurFournisseur('refus', 'Le modèle a refusé de traiter cette scène.', true)
      }
      const brut = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
      let donnees: unknown = msg.parsed_output
      if (donnees === null || donnees === undefined) {
        try {
          donnees = extraireJson(brut)
        } catch (e) {
          throw new ErreurFournisseur('illisible', 'La réponse de l’IA était illisible. Vous pouvez réessayer.', true, e instanceof Error ? e.message : String(e))
        }
      }
      return { donnees, brut, usage: this.usage(req, msg.usage) }
    } catch (e) {
      throw traduire(e)
    }
  }

  async tester(modele: string): Promise<{ ok: boolean; message: string; modeles?: string[] }> {
    try {
      const modeles: string[] = []
      for await (const m of this.client.models.list({ limit: 100 })) {
        modeles.push(m.id)
        if (modeles.length >= 100) break
      }
      if (modele && !modeles.includes(modele)) {
        try {
          await this.client.models.retrieve(modele)
        } catch (e) {
          if (e instanceof Anthropic.NotFoundError) {
            return { ok: false, message: `La clé fonctionne, mais le modèle « ${modele} » est introuvable.`, modeles }
          }
          throw e
        }
      }
      return { ok: true, message: 'Connexion à Claude réussie.', modeles }
    } catch (e) {
      return { ok: false, message: traduire(e).message }
    }
  }
}

/** Erreurs typées du SDK → messages lisibles en français. Du plus précis au plus général. */
function traduire(e: unknown): ErreurFournisseur {
  if (e instanceof ErreurFournisseur) return e
  if (e instanceof Anthropic.APIUserAbortError) return new ErreurFournisseur('annule', 'Génération interrompue.', true)
  if (e instanceof Anthropic.AuthenticationError) {
    return new ErreurFournisseur('cle', 'La clé API Anthropic est refusée. Vérifiez-la dans Réglages › IA.', false)
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return new ErreurFournisseur('cle', 'Cette clé API n’a pas accès à ce modèle. Choisissez-en un autre dans Réglages › IA.', false, e.message)
  }
  if (e instanceof Anthropic.NotFoundError) {
    return new ErreurFournisseur('inconnu', 'Modèle introuvable. Vérifiez son nom dans Réglages › IA.', false, e.message)
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new ErreurFournisseur('limite', 'Limite de débit atteinte chez Anthropic. Patientez une minute, puis réessayez.', true, e.message)
  }
  if (e instanceof Anthropic.BadRequestError) {
    return new ErreurFournisseur('inconnu', 'La demande a été rejetée par l’API (crédit épuisé, modèle ou réglage incompatible).', true, e.message)
  }
  if (e instanceof Anthropic.InternalServerError) {
    return new ErreurFournisseur('surcharge', 'Les serveurs d’Anthropic sont momentanément surchargés. Réessayez dans un instant.', true, e.message)
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new ErreurFournisseur('reseau', 'Impossible de joindre Anthropic. Vérifiez votre connexion Internet.', true, e.message)
  }
  if (e instanceof Anthropic.APIError) {
    return new ErreurFournisseur('inconnu', `Erreur de l’API Anthropic (${e.status ?? '?'}).`, true, e.message)
  }
  return new ErreurFournisseur('inconnu', 'Erreur inattendue pendant l’appel à Claude.', true, e instanceof Error ? e.message : String(e))
}
