/**
 * Prompts d'images et règles de contenu.
 * Les règles sont appliquées trois fois : (1) filtre sur le texte venu de l'IA de texte,
 * (2) mentions positives imposées (adulte, habillé), (3) prompt négatif imposé.
 */
import type { Expression, GameState, Lieu, Lumiere, Personnage } from '@shared/types'

export type GenreImage = 'sprite' | 'decor' | 'illustration'

export interface DemandeImage {
  genre: GenreImage
  prompt: string
  negatif: string
  graine: number
  largeur: number
  hauteur: number
  /** Image de référence (PNG) pour garder le même visage et la même tenue. */
  reference?: Uint8Array
  signal?: AbortSignal
}

export const STYLES: Record<string, { nom: string; prompt: string }> = {
  anime: { nom: 'Anime', prompt: 'anime visual novel art style, clean lineart, soft cel shading, detailed eyes' },
  aquarelle: { nom: 'Aquarelle', prompt: 'delicate watercolor illustration, soft washes, visible paper texture, gentle outlines' },
  huile: { nom: 'Peinture à l’huile', prompt: 'classical oil painting, rich brushwork, chiaroscuro lighting, painterly' },
  encre: { nom: 'Encre et lavis', prompt: 'ink and wash illustration, expressive brush lines, limited palette, elegant' },
  'semi-realiste': { nom: 'Semi-réaliste', prompt: 'semi-realistic digital painting, soft lighting, detailed, concept art quality' },
  pastel: { nom: 'Pastel doux', prompt: 'soft pastel illustration, dreamy light, muted colors, storybook quality' },
}

/** Mots qui n'ont rien à faire dans un prompt d'image de ce jeu, en français et en anglais. */
const INTERDITS = [
  'nue?s?', 'nudit[ée]', 'd[ée]nud[ée]e?s?', 'd[ée]shabill[ée]e?s?', 'lingerie', 'sous-v[êe]tements?', 'seins?', 'poitrine', 'topless', 'sexuel(?:le)?s?', 'sexe', '[ée]rotique',
  'nude', 'naked', 'nudity', 'nsfw', 'underwear', 'cleavage', 'breasts?', 'nipples?', 'sexual', 'sexy', 'erotic', 'bikini', 'swimsuit',
  'enfants?', 'enfantine?', 'fillette', 'gamine?', 'adolescente?s?', 'mineure?s?', 'lolita?', 'loli', 'child(?:ren|like)?', 'kids?', 'teen(?:ager)?s?', 'underage', 'schoolgirl', 'petite fille',
]
const RE_INTERDITS = new RegExp(`(?<![\\p{L}])(?:${INTERDITS.join('|')})(?![\\p{L}])`, 'giu')

/** Retire les termes interdits d'un texte destiné à un générateur d'images. */
export function assainir(texte: string): string {
  return texte.replace(RE_INTERDITS, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').trim()
}

export function contientInterdit(texte: string): boolean {
  RE_INTERDITS.lastIndex = 0
  return RE_INTERDITS.test(texte)
}

const NEGATIF_COMMUN = 'nsfw, nude, nudity, naked, lingerie, underwear, cleavage, sexual, suggestive, child, kid, loli, teenager, young-looking, childlike, text, watermark, signature, logo, low quality, blurry, deformed, extra limbs, bad hands'

const EXPRESSIONS_EN: Record<Expression, string> = {
  neutre: 'calm neutral expression, closed mouth',
  sourire: 'warm gentle smile',
  colere: 'angry expression, furrowed brows, stern mouth',
  gene: 'embarrassed expression, blushing cheeks, looking slightly away',
  tristesse: 'sad expression, downcast eyes',
  surprise: 'surprised expression, wide eyes, slightly open mouth',
}

const LUMIERES_EN: Record<Lumiere, string> = {
  jour: 'bright daylight, clear sky',
  crepuscule: 'golden hour, warm sunset light, long shadows',
  nuit: 'night, moonlight, glowing lanterns and lit windows, deep blue shadows',
}

function style(etat: GameState): string {
  return (STYLES[etat.preferences.style] ?? STYLES.anime).prompt
}

export const TAILLES: Record<GenreImage, { largeur: number; hauteur: number }> = {
  sprite: { largeur: 832, hauteur: 1216 },
  decor: { largeur: 1344, hauteur: 768 },
  illustration: { largeur: 1344, hauteur: 768 },
}

export function promptSprite(etat: GameState, p: Personnage, expression: Expression, styleUnivers = ''): Pick<DemandeImage, 'prompt' | 'negatif'> {
  const genre = /\b(homme|il est|garçon|monsieur|barbe|moustache)\b/i.test(`${p.apparence} ${p.description}`) ? 'man' : 'woman'
  const age = Math.max(18, p.age)
  const prompt = [
    style(etat), 'solo', `one adult ${genre}`, `${age} years old, mature adult face and proportions`, assainir(p.apparence), 'fully clothed, modest outfit',
    EXPRESSIONS_EN[expression], 'upper body portrait from the waist up, standing, facing the viewer, arms relaxed',
    'plain solid white background, no scenery, even studio lighting', styleUnivers,
  ].filter(Boolean).join(', ')
  return { prompt, negatif: `${NEGATIF_COMMUN}, multiple people, background, scenery, cropped head, cut off` }
}

export function promptDecor(etat: GameState, lieu: Lieu, lumiere: Lumiere, styleUnivers = ''): Pick<DemandeImage, 'prompt' | 'negatif'> {
  const prompt = [
    style(etat), 'background art for a visual novel, empty scene, no people', assainir(lieu.nom), assainir(lieu.description), assainir(etat.monde.cadre).slice(0, 160),
    LUMIERES_EN[lumiere], 'wide establishing shot, detailed environment, atmospheric perspective', styleUnivers,
  ].filter(Boolean).join(', ')
  return { prompt, negatif: `${NEGATIF_COMMUN}, people, person, character, figure, crowd, portrait` }
}

export function promptIllustration(etat: GameState, titre: string, description: string, styleUnivers = ''): Pick<DemandeImage, 'prompt' | 'negatif'> {
  const prompt = [
    style(etat), 'event illustration for a visual novel, cinematic composition, emotional moment', assainir(titre), assainir(description),
    'adult characters, fully clothed', styleUnivers,
  ].filter(Boolean).join(', ')
  return { prompt, negatif: NEGATIF_COMMUN }
}
