/**
 * Fournisseurs d'images interchangeables.
 *  - ComfyUI (local) : API HTTP /prompt, /history, /view, /upload/image.
 *  - Automatic1111 / Forge (local, lancé avec --api) : /sdapi/v1/txt2img et /img2img.
 *  - API d'images compatible OpenAI (en ligne) : /images/generations et /images/edits.
 * Le mode procédural n'est pas ici : il est géré directement par le service (aucun appel réseau).
 */
import { ErreurFournisseur, erreurReseau } from '@core/ai/types'
import type { DemandeImage } from './prompts'

export interface ImageProduite {
  donnees: Uint8Array
  mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'
  /** Le fournisseur a déjà rendu un fond transparent. */
  transparent?: boolean
}

export interface FournisseurImages {
  readonly id: string
  generer(d: DemandeImage): Promise<ImageProduite>
  tester(): Promise<{ ok: boolean; message: string; modeles?: string[] }>
}

const b64 = (d: Uint8Array) => Buffer.from(d).toString('base64')
const deB64 = (s: string) => new Uint8Array(Buffer.from(s.replace(/^data:[^,]+,/, ''), 'base64'))

async function jsonOuErreur(rep: Response, quoi: string): Promise<any> {
  if (!rep.ok) {
    const detail = (await rep.text().catch(() => '')).slice(0, 400)
    if (rep.status === 401 || rep.status === 403) throw new ErreurFournisseur('cle', `La clé API est refusée par ${quoi}.`, false, detail)
    if (rep.status === 429) throw new ErreurFournisseur('limite', `Limite de débit ou de crédit atteinte chez ${quoi}.`, true, detail)
    throw new ErreurFournisseur('inconnu', `${quoi} a répondu par une erreur (${rep.status}).`, true, detail)
  }
  return rep.json()
}

// ───────────────────────── Automatic1111 / Forge ─────────────────────────

export class FournisseurA1111 implements FournisseurImages {
  readonly id = 'a1111'
  private url: string
  constructor(url: string) { this.url = url.replace(/\/+$/, '') }

  async generer(d: DemandeImage): Promise<ImageProduite> {
    const commun = {
      prompt: d.prompt, negative_prompt: d.negatif, seed: d.graine, width: d.largeur, height: d.hauteur,
      steps: 26, cfg_scale: 6.5, sampler_name: 'DPM++ 2M', batch_size: 1,
    }
    // Avec une image de référence : img2img à débruitage modéré → même visage, même tenue, expression différente.
    const chemin = d.reference ? '/sdapi/v1/img2img' : '/sdapi/v1/txt2img'
    const corps = d.reference ? { ...commun, init_images: [b64(d.reference)], denoising_strength: 0.45 } : commun
    let rep: Response
    try {
      rep = await fetch(`${this.url}${chemin}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps), signal: d.signal })
    } catch (e) {
      throw erreurReseau(e, 'Automatic1111 (est-il lancé avec l’option --api ?)')
    }
    const json = await jsonOuErreur(rep, 'Automatic1111')
    const image = json.images?.[0]
    if (typeof image !== 'string') throw new ErreurFournisseur('illisible', 'Automatic1111 n’a renvoyé aucune image.', true)
    return { donnees: deB64(image), mime: 'image/png' }
  }

  async tester(): Promise<{ ok: boolean; message: string; modeles?: string[] }> {
    try {
      const rep = await fetch(`${this.url}/sdapi/v1/sd-models`)
      if (!rep.ok) return { ok: false, message: `Automatic1111 a répondu par une erreur (${rep.status}). Est-il lancé avec l’option --api ?` }
      const json: any = await rep.json()
      const modeles = (Array.isArray(json) ? json : []).map((m: any) => String(m.title ?? m.model_name))
      return { ok: true, message: `Connexion à Automatic1111 réussie (${modeles.length} modèle${modeles.length > 1 ? 's' : ''}).`, modeles }
    } catch (e) {
      return { ok: false, message: erreurReseau(e, 'Automatic1111').message }
    }
  }
}

// ───────────────────────── ComfyUI ─────────────────────────

export class FournisseurComfy implements FournisseurImages {
  readonly id = 'comfyui'
  private url: string
  constructor(url: string, private modele: string) { this.url = url.replace(/\/+$/, '') }

  /** Graphe minimal : checkpoint → prompts → latent (vide ou encodé depuis la référence) → échantillonneur → image. */
  private graphe(d: DemandeImage, modele: string, reference?: string) {
    const g: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: modele } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: d.prompt, clip: ['1', 1] } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: d.negatif, clip: ['1', 1] } },
      '5': {
        class_type: 'KSampler',
        inputs: {
          model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0], seed: d.graine, steps: 26, cfg: 6.5,
          sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: reference ? 0.5 : 1,
        },
      },
      '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
      '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'resonance' } },
    }
    if (reference) {
      g['8'] = { class_type: 'LoadImage', inputs: { image: reference } }
      g['4'] = { class_type: 'VAEEncode', inputs: { pixels: ['8', 0], vae: ['1', 2] } }
    } else {
      g['4'] = { class_type: 'EmptyLatentImage', inputs: { width: d.largeur, height: d.hauteur, batch_size: 1 } }
    }
    return g
  }

  private async modeles(): Promise<string[]> {
    const rep = await fetch(`${this.url}/object_info/CheckpointLoaderSimple`)
    const json = await jsonOuErreur(rep, 'ComfyUI')
    const liste = json?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]
    return Array.isArray(liste) ? liste.map(String) : []
  }

  private async televerser(png: Uint8Array, signal?: AbortSignal): Promise<string> {
    const form = new FormData()
    form.append('image', new Blob([png as BlobPart], { type: 'image/png' }), `resonance-ref-${Date.now()}.png`)
    form.append('overwrite', 'true')
    const rep = await fetch(`${this.url}/upload/image`, { method: 'POST', body: form, signal })
    const json = await jsonOuErreur(rep, 'ComfyUI')
    return json.subfolder ? `${json.subfolder}/${json.name}` : String(json.name)
  }

  async generer(d: DemandeImage): Promise<ImageProduite> {
    try {
      let modele = this.modele
      if (!modele) {
        modele = (await this.modeles())[0] ?? ''
        if (!modele) throw new ErreurFournisseur('inconnu', 'ComfyUI n’a aucun modèle (checkpoint) installé.', false)
        this.modele = modele
      }
      const reference = d.reference ? await this.televerser(d.reference, d.signal) : undefined
      const rep = await fetch(`${this.url}/prompt`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: this.graphe(d, modele, reference), client_id: 'resonance' }), signal: d.signal,
      })
      const { prompt_id: id } = await jsonOuErreur(rep, 'ComfyUI')
      if (!id) throw new ErreurFournisseur('illisible', 'ComfyUI n’a pas accepté la demande.', true)
      // ComfyUI travaille en file d'attente : on interroge l'historique jusqu'à ce que l'image soit prête.
      const limite = Date.now() + 10 * 60_000
      while (Date.now() < limite) {
        if (d.signal?.aborted) throw new ErreurFournisseur('annule', 'Génération interrompue.', true)
        await new Promise((r) => setTimeout(r, 1200))
        const h = await jsonOuErreur(await fetch(`${this.url}/history/${id}`, { signal: d.signal }), 'ComfyUI')
        const entree = h?.[id]
        if (!entree) continue
        if (entree.status?.status_str === 'error') throw new ErreurFournisseur('inconnu', 'ComfyUI a signalé une erreur pendant la génération.', true, JSON.stringify(entree.status).slice(0, 400))
        for (const sortie of Object.values<any>(entree.outputs ?? {})) {
          const img = sortie.images?.[0]
          if (!img) continue
          const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? '', type: img.type ?? 'output' })
          const vue = await fetch(`${this.url}/view?${q}`, { signal: d.signal })
          if (!vue.ok) throw new ErreurFournisseur('illisible', 'ComfyUI n’a pas rendu l’image produite.', true)
          return { donnees: new Uint8Array(await vue.arrayBuffer()), mime: 'image/png' }
        }
      }
      throw new ErreurFournisseur('surcharge', 'ComfyUI met trop de temps à répondre.', true)
    } catch (e) {
      throw erreurReseau(e, 'ComfyUI')
    }
  }

  async tester(): Promise<{ ok: boolean; message: string; modeles?: string[] }> {
    try {
      const modeles = await this.modeles()
      if (!modeles.length) return { ok: false, message: 'ComfyUI est lancé, mais aucun modèle (checkpoint) n’est installé.', modeles }
      return { ok: true, message: `Connexion à ComfyUI réussie (${modeles.length} modèle${modeles.length > 1 ? 's' : ''}).`, modeles }
    } catch (e) {
      return { ok: false, message: erreurReseau(e, 'ComfyUI').message }
    }
  }
}

// ───────────────────────── API d'images compatible OpenAI ─────────────────────────

export class FournisseurOpenAIImages implements FournisseurImages {
  readonly id = 'openai-images'
  private url: string
  constructor(url: string, private cle: string, private modele: string) { this.url = url.replace(/\/+$/, '') }

  private get natif(): boolean {
    return /^gpt-image/.test(this.modele)
  }

  private taille(d: DemandeImage): string {
    if (!this.natif) return `${d.largeur}x${d.hauteur}`
    return d.largeur > d.hauteur ? '1536x1024' : d.largeur < d.hauteur ? '1024x1536' : '1024x1024'
  }

  async generer(d: DemandeImage): Promise<ImageProduite> {
    // Ces API n'ont pas de prompt négatif : on le reformule en consigne.
    const prompt = `${d.prompt}. Strictly avoid: ${d.negatif}.`
    const transparent = this.natif && d.genre === 'sprite'
    let rep: Response
    try {
      if (d.reference && this.natif) {
        const form = new FormData()
        form.append('model', this.modele)
        form.append('prompt', `Same character, same face, same hairstyle, same outfit as the reference image. ${prompt}`)
        form.append('size', this.taille(d))
        if (transparent) form.append('background', 'transparent')
        form.append('image', new Blob([d.reference as BlobPart], { type: 'image/png' }), 'reference.png')
        rep = await fetch(`${this.url}/images/edits`, { method: 'POST', headers: { authorization: `Bearer ${this.cle}` }, body: form, signal: d.signal })
      } else {
        const corps: Record<string, unknown> = { model: this.modele, prompt, size: this.taille(d), n: 1 }
        if (this.natif) { corps.quality = 'medium'; if (transparent) corps.background = 'transparent' }
        else corps.response_format = 'b64_json'
        rep = await fetch(`${this.url}/images/generations`, {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cle}` }, body: JSON.stringify(corps), signal: d.signal,
        })
      }
    } catch (e) {
      throw erreurReseau(e, 'le service d’images')
    }
    const json = await jsonOuErreur(rep, 'le service d’images')
    const item = json.data?.[0]
    if (item?.b64_json) return { donnees: deB64(item.b64_json), mime: 'image/png', transparent }
    if (item?.url) {
      const img = await fetch(item.url, { signal: d.signal })
      if (!img.ok) throw new ErreurFournisseur('illisible', 'Impossible de récupérer l’image produite.', true)
      const type = img.headers.get('content-type') ?? ''
      return { donnees: new Uint8Array(await img.arrayBuffer()), mime: type.includes('jpeg') ? 'image/jpeg' : type.includes('webp') ? 'image/webp' : 'image/png' }
    }
    throw new ErreurFournisseur('illisible', 'Le service d’images n’a renvoyé aucune image.', true)
  }

  async tester(): Promise<{ ok: boolean; message: string }> {
    if (!this.cle) return { ok: false, message: 'Aucune clé API enregistrée pour le service d’images.' }
    try {
      const rep = await fetch(`${this.url}/models`, { headers: { authorization: `Bearer ${this.cle}` } })
      if (rep.status === 401 || rep.status === 403) return { ok: false, message: 'La clé API est refusée par le service d’images.' }
      if (!rep.ok) return { ok: false, message: `Le service d’images a répondu par une erreur (${rep.status}).` }
      return { ok: true, message: 'Connexion au service d’images réussie. Chaque image générée sera facturée par ce service.' }
    } catch (e) {
      return { ok: false, message: erreurReseau(e, 'le service d’images').message }
    }
  }
}
