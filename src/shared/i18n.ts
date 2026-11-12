/**
 * Internationalisation, façon « gettext » : le texte français est la clé.
 *   t('Nouvelle histoire')            → « Nouvelle histoire » (ou sa traduction si un dictionnaire est chargé)
 *   t('Jour {n}', { n: 3 })           → « Jour 3 »
 * Ajouter une langue = fournir un dictionnaire { 'texte français': 'traduction' } à `chargerLangue`.
 * Les consignes d'IA ont leur propre jeu par langue (src/core/ai/prompts/).
 */
let dictionnaire: Record<string, string> = {}
let langue = 'fr'

export function chargerLangue(code: string, traductions: Record<string, string>): void {
  langue = code
  dictionnaire = traductions
}

export function langueCourante(): string {
  return langue
}

export function t(cle: string, variables?: Record<string, string | number>): string {
  let texte = dictionnaire[cle] ?? cle
  if (variables) for (const [k, v] of Object.entries(variables)) texte = texte.replaceAll(`{${k}}`, String(v))
  return texte
}
