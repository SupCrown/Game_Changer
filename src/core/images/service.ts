/**
 * Service d'images : cache par partie, génération en arrière-plan, repli procédural.
 *
 * Clés :  decor:<lieu>:<lumière>   sprite:<personnage>:<expression>   cg:<id>
 *
 * Principe : une demande répond TOUJOURS immédiatement. Si l'image définitive n'existe pas encore,
 * on renvoie une image procédurale (instantanée, gratuite) et, si un vrai générateur est configuré,
 * on lance la génération en arrière-plan ; l'interface est prévenue quand l'image est prête.
 */
import type { EvenementTour, Expression, GameState, Ligne, Lumiere, Reglages } from '@shared/types'
import { EXPRESSIONS } from '@shared/types'
import type { RapportScene } from '@core/ai/schemas'
import { versErreurIA } from '@core/ai/types'
import type { Depot } from '@core/storage/depot'
import { lumiereDe } from '@core/rules/rythme'
import { trouverParNom } from '@core/rules/moteur'
import { grainede } from '@core/rules/des'
import type { PackUnivers } from '@core/game/creation'
import { decorSvg, illustrationSvg, spriteSvg, type ThemeArt } from './procedural'
import { promptDecor, promptIllustration, promptSprite, TAILLES, type DemandeImage, type GenreImage } from './prompts'
import type { FournisseurImages, ImageProduite } from './fournisseurs'

export interface Fichiers {
  ecrire(partie: string, nom: string, donnees: Uint8Array): void
  lire(partie: string, nom: string): Uint8Array | null
  supprimerTout(partie: string): void
}

export interface DependancesImages {
  depot: Depot
  fichiers: Fichiers
  /** null = mode procédural (aucune génération externe). */
  fournisseur(): FournisseurImages | null
  reglages(): Reglages
  univers(id: string): PackUnivers | undefined
  /** Détoure un PNG (fond uni → transparent). Renvoie null si le détourage n'est pas crédible. */
  detourer?(png: Uint8Array): Uint8Array | null
  emettre(e: EvenementTour): void
  url(partie: string, fichier: string, version: number): string
  noterCout?(partie: string, cout: number): void
  maintenant?(): number
}

const THEMES: ThemeArt[] = ['fantasy', 'gothique', 'orientale', 'steampunk', 'moderne', 'libre']
const EXT: Record<ImageProduite['mime'], string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }

export const cleDecor = (lieu: string, lumiere: Lumiere) => `decor:${lieu}:${lumiere}`
export const cleSprite = (personnage: string, expression: Expression) => `sprite:${personnage}:${expression}`
export const cleCg = (id: string) => `cg:${id}`

function nomFichier(cle: string, ext: string, suffixe = ''): string {
  return `${cle.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 60)}_${grainede(cle).toString(36)}${suffixe}.${ext}`
}

export class ServiceImages {
  private file: (() => Promise<void>)[] = []
  private actif = false
  private enCours = new Set<string>()
  /** Clés dont la génération a échoué pendant cette session : on ne réessaie pas en boucle. */
  private echecs = new Set<string>()

  constructor(private d: DependancesImages) {}

  private theme(etat: GameState): ThemeArt {
    return (THEMES as string[]).includes(etat.monde.theme) ? (etat.monde.theme as ThemeArt) : 'libre'
  }

  private maintenant(): number {
    return (this.d.maintenant ?? Date.now)()
  }

  /** Image procédurale correspondant à une clé. Renvoie null si la clé ne désigne rien de connu. */
  procedural(etat: GameState, cle: string): string | null {
    const [genre, id, variante] = cle.split(':')
    const theme = this.theme(etat)
    if (genre === 'decor') {
      const lieu = etat.lieux.find((l) => l.id === id)
      if (!lieu) return null
      return decorSvg({ type: lieu.type, lumiere: (variante as Lumiere) || 'jour', graine: grainede(`${etat.id}:${lieu.id}`), theme, nom: lieu.nom })
    }
    if (genre === 'sprite') {
      const p = etat.personnages.find((x) => x.id === id)
      if (!p) return null
      const expression = (EXPRESSIONS as readonly string[]).includes(variante) ? (variante as Expression) : 'neutre'
      return spriteSvg({ graine: p.graine, expression, couleur: p.couleur, apparence: `${p.apparence} ${p.description}`, theme })
    }
    if (genre === 'cg') {
      const g = etat.galerie.find((x) => x.id === id)
      return illustrationSvg({ graine: grainede(`${etat.id}:${id}`), titre: g?.titre ?? '', humeur: g?.humeur ?? 'romance', theme })
    }
    return null
  }

  /**
   * Renvoie tout de suite une image affichable pour cette clé.
   * `provisoire` : une image définitive est en cours de génération et remplacera celle-ci.
   */
  obtenir(etat: GameState, cle: string, description?: string): { url: string; provisoire: boolean } | null {
    const partie = etat.id
    const existante = this.d.depot.image(partie, cle)
    if (existante) return { url: this.d.url(partie, existante.fichier, existante.creeLe), provisoire: false }

    const svg = this.procedural(etat, cle)
    if (!svg) return null
    const fichier = nomFichier(cle, 'svg', '_p')
    this.d.fichiers.ecrire(partie, fichier, new TextEncoder().encode(svg))
    const fournisseur = this.d.fournisseur()
    if (!fournisseur || this.echecs.has(`${partie}|${cle}`)) {
      this.d.depot.enregistrerImage(partie, { cle, fichier, prompt: '', graine: 0, fournisseur: 'procedural', creeLe: this.maintenant() })
      return { url: this.d.url(partie, fichier, 1), provisoire: false }
    }
    this.planifier(etat, cle, description)
    return { url: this.d.url(partie, fichier, 1), provisoire: true }
  }

  private planifier(etat: GameState, cle: string, description?: string, promptLibre?: string): void {
    const id = `${etat.id}|${cle}`
    if (this.enCours.has(id)) return
    this.enCours.add(id)
    this.file.push(async () => {
      try {
        await this.generer(etat, cle, description, promptLibre)
      } catch (e) {
        this.echecs.add(id)
        const err = versErreurIA(e)
        if (err.genre !== 'annule') {
          this.d.emettre({ type: 'erreur', erreur: { ...err, message: `Image non générée (l’image procédurale est conservée). ${err.message}`, reessayable: false } })
        }
      } finally {
        this.enCours.delete(id)
      }
    })
    void this.vider()
  }

  private async vider(): Promise<void> {
    if (this.actif) return
    this.actif = true
    this.d.emettre({ type: 'phase', phase: 'image' })
    try {
      for (let tache = this.file.shift(); tache; tache = this.file.shift()) await tache()
    } finally {
      this.actif = false
      this.d.emettre({ type: 'phase', phase: 'repos', detail: 'image' })
    }
  }

  get occupe(): boolean {
    return this.actif
  }

  private demande(etat: GameState, cle: string, description?: string): (Pick<DemandeImage, 'prompt' | 'negatif'> & { genre: GenreImage; graine: number; reference?: Uint8Array }) | null {
    const [genre, id, variante] = cle.split(':')
    const styleUnivers = this.d.univers(etat.preferences.univers)?.styleImage ?? ''
    if (genre === 'decor') {
      const lieu = etat.lieux.find((l) => l.id === id)
      if (!lieu) return null
      return { genre: 'decor', graine: grainede(`${etat.id}:${lieu.id}`) % 2147483647, ...promptDecor(etat, lieu, (variante as Lumiere) || 'jour', styleUnivers) }
    }
    if (genre === 'sprite') {
      const p = etat.personnages.find((x) => x.id === id)
      if (!p) return null
      const expression = (EXPRESSIONS as readonly string[]).includes(variante) ? (variante as Expression) : 'neutre'
      // Cohérence : même graine pour toutes les expressions, et le portrait neutre sert de référence.
      let reference: Uint8Array | undefined
      if (expression !== 'neutre') {
        const neutre = this.d.depot.image(etat.id, cleSprite(p.id, 'neutre'))
        if (neutre && neutre.fournisseur !== 'procedural' && neutre.fichier.endsWith('.png')) reference = this.d.fichiers.lire(etat.id, neutre.fichier) ?? undefined
      }
      return { genre: 'sprite', graine: p.graine % 2147483647, reference, ...promptSprite(etat, p, expression, styleUnivers) }
    }
    if (genre === 'cg') {
      const g = etat.galerie.find((x) => x.id === id)
      return { genre: 'illustration', graine: grainede(`${etat.id}:${id}`) % 2147483647, ...promptIllustration(etat, g?.titre ?? '', description ?? '', styleUnivers) }
    }
    return null
  }

  private async generer(etat: GameState, cle: string, description?: string, promptLibre?: string): Promise<void> {
    const fournisseur = this.d.fournisseur()
    const base = this.demande(etat, cle, description)
    if (!fournisseur || !base) return
    const taille = TAILLES[base.genre]
    const image = await fournisseur.generer({ ...base, prompt: promptLibre?.trim() || base.prompt, ...taille })
    let donnees = image.donnees
    let ext = EXT[image.mime]
    if (base.genre === 'sprite' && !image.transparent && image.mime !== 'image/svg+xml' && this.d.detourer) {
      const detoure = this.d.detourer(donnees)
      if (detoure) { donnees = detoure; ext = 'png' }
    }
    const quand = this.maintenant()
    const fichier = nomFichier(cle, ext, `_${quand.toString(36)}`)
    this.d.fichiers.ecrire(etat.id, fichier, donnees)
    this.d.depot.enregistrerImage(etat.id, { cle, fichier, prompt: promptLibre?.trim() || base.prompt, graine: base.graine, fournisseur: fournisseur.id, creeLe: quand })
    if (fournisseur.id === 'openai-images') this.d.noterCout?.(etat.id, this.d.reglages().images.coutEstime)
    this.d.emettre({ type: 'image', cle, url: this.d.url(etat.id, fichier, quand) })
  }

  /** Le joueur demande une nouvelle version (éventuellement avec un prompt retouché). */
  regenerer(etat: GameState, cle: string, promptLibre?: string): boolean {
    if (!this.d.fournisseur()) return false
    this.echecs.delete(`${etat.id}|${cle}`)
    const g = etat.galerie.find((x) => `cg:${x.id}` === cle)
    this.planifier(etat, cle, g?.titre, promptLibre)
    return true
  }

  /** Le joueur remplace l'image par la sienne. */
  importer(etat: GameState, cle: string, donnees: Uint8Array, mime: ImageProduite['mime']): string {
    const quand = this.maintenant()
    const fichier = nomFichier(cle, EXT[mime] ?? 'png', `_i${quand.toString(36)}`)
    this.d.fichiers.ecrire(etat.id, fichier, donnees)
    this.d.depot.enregistrerImage(etat.id, { cle, fichier, prompt: '(image importée)', graine: 0, fournisseur: 'import', creeLe: quand })
    const url = this.d.url(etat.id, fichier, quand)
    this.d.emettre({ type: 'image', cle, url })
    return url
  }

  /** Revient à l'image procédurale (ou la laisse être régénérée à la prochaine demande). */
  reinitialiser(etat: GameState, cle: string): void {
    this.d.depot.supprimerImage(etat.id, cle)
    this.echecs.delete(`${etat.id}|${cle}`)
    const r = this.obtenir(etat, cle)
    if (r) this.d.emettre({ type: 'image', cle, url: r.url })
  }

  prompt(etat: GameState, cle: string): string {
    return this.d.depot.image(etat.id, cle)?.prompt || this.demande(etat, cle)?.prompt || ''
  }

  /**
   * Après chaque scène : prépare ce que le joueur verra ensuite, pendant qu'il lit.
   * (décor du lieu courant, sprites des personnages présents, illustration éventuelle, décor de la lumière suivante)
   */
  apresScene(etat: GameState, rapport: RapportScene, lignes: Ligne[]): void {
    if (!this.d.fournisseur()) return
    const r = this.d.reglages().images
    const lumiere = lumiereDe(etat.calendrier)
    if (etat.lieuActuel) this.obtenir(etat, cleDecor(etat.lieuActuel, lumiere))
    const noms = new Set([...rapport.presents, ...lignes.flatMap((l) => (l.type === 'replique' ? [l.personnage] : []))])
    for (const nom of noms) {
      const p = trouverParNom(etat.personnages, nom)
      if (p) this.obtenir(etat, cleSprite(p.id, 'neutre'))
    }
    if (rapport.momentFort && r.illustrations) {
      const g = etat.galerie[etat.galerie.length - 1]
      if (g) this.obtenir(etat, cleCg(g.id), rapport.momentFort.description)
    }
    if (r.prechargement && etat.lieuActuel) {
      const suivante: Lumiere = lumiere === 'jour' ? 'crepuscule' : lumiere === 'crepuscule' ? 'nuit' : 'jour'
      this.obtenir(etat, cleDecor(etat.lieuActuel, suivante))
      // Lieux où le plan du jour emmènera probablement le joueur : ceux des personnages attendus restent inconnus,
      // on précharge donc les lieux déjà découverts les plus récents.
      for (const lieu of etat.lieux.filter((l) => l.decouvert && l.id !== etat.lieuActuel).slice(-2)) this.obtenir(etat, cleDecor(lieu.id, lumiere))
    }
  }

  /** « Nouvelle histoire » : efface aussi les images. */
  supprimerTout(partie: string): void {
    this.d.fichiers.supprimerTout(partie)
  }
}
