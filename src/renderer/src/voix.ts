/**
 * Synthèse vocale locale et gratuite (voix installées sur le système, via l'API Web Speech).
 * Chaque personnage garde la même voix : elle est tirée de sa graine (voix, hauteur, débit).
 */
let voixFr: SpeechSynthesisVoice[] = []

function charger(): void {
  if (typeof speechSynthesis === 'undefined') return
  const toutes = speechSynthesis.getVoices()
  const fr = toutes.filter((v) => v.lang.toLowerCase().startsWith('fr'))
  voixFr = fr.length ? fr : toutes
}

if (typeof speechSynthesis !== 'undefined') {
  charger()
  speechSynthesis.addEventListener('voiceschanged', charger)
}

export function voixDisponible(): boolean {
  return voixFr.length > 0
}

export function dire(texte: string, graine: number | null, volume: number): void {
  if (typeof speechSynthesis === 'undefined' || !voixFr.length) return
  speechSynthesis.cancel()
  const propre = texte.replace(/[*_«»"]/g, ' ').trim()
  if (!propre) return
  const u = new SpeechSynthesisUtterance(propre)
  u.lang = 'fr-FR'
  u.volume = Math.max(0, Math.min(1, volume))
  if (graine === null) {
    u.voice = voixFr[0]
    u.pitch = 1
    u.rate = 1
  } else {
    u.voice = voixFr[graine % voixFr.length]
    u.pitch = 0.85 + ((graine >>> 3) % 50) / 100
    u.rate = 0.94 + ((graine >>> 9) % 16) / 100
  }
  speechSynthesis.speak(u)
}

export function taire(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}
