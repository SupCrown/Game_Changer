import { describe, expect, it } from 'vitest'
import { decorSvg, illustrationSvg, spriteSvg } from '@core/images/procedural'
import { EXPRESSIONS, TYPES_LIEU } from '@shared/types'
import { assainir, contientInterdit, promptSprite } from '@core/images/prompts'
import { detourageCredible, detourer } from '@core/images/detourage'
import { etatDeTest } from './outils'

const sain = (svg: string) => {
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg.endsWith('</svg>')).toBe(true)
  expect(svg).not.toMatch(/NaN|undefined|<script|foreignObject|href="http/)
}

describe('images procédurales', () => {
  it('dessine les 15 types de lieu, de façon déterministe, et la lumière change l’image', () => {
    for (const type of TYPES_LIEU) {
      const jour = decorSvg({ type, lumiere: 'jour', graine: 7, theme: 'fantasy' })
      sain(jour)
      expect(decorSvg({ type, lumiere: 'jour', graine: 7, theme: 'fantasy' })).toBe(jour)
      expect(decorSvg({ type, lumiere: 'nuit', graine: 7, theme: 'fantasy' })).not.toBe(jour)
    }
  })

  it('donne six expressions distinctes à un même personnage', () => {
    const o = { graine: 42, couleur: '#c9b3ec', apparence: 'cheveux argent longs, yeux gris', theme: 'fantasy' as const }
    const tous = EXPRESSIONS.map((expression) => spriteSvg({ ...o, expression }))
    tous.forEach(sain)
    expect(new Set(tous).size).toBe(6)
    expect(spriteSvg({ ...o, expression: 'neutre' })).toBe(tous[0])
    // Le corps (coiffure, tenue) ne dépend pas de l'expression.
    const corps = (s: string) => /<g data-partie="corps">([\s\S]*?)<\/g><g data-partie="visage">/.exec(s)?.[1]
    expect(corps(tous[0])).toBeTruthy()
    expect(corps(tous[1])).toBe(corps(tous[0]))
  })

  it('échappe le titre d’une illustration', () => {
    const svg = illustrationSvg({ graine: 3, titre: 'Lui & <elle>', humeur: 'romance', theme: 'libre' })
    sain(svg)
    expect(svg).toContain('Lui &amp; &lt;elle&gt;')
  })
})

describe('règles de contenu des images', () => {
  it('retire les termes interdits et impose adulte + habillé', () => {
    expect(contientInterdit('une fillette en lingerie')).toBe(true)
    expect(assainir('jeune femme nue, cheveux roux')).not.toMatch(/nue/)
    expect(contientInterdit('une tenue de bal')).toBe(false)
    const e = etatDeTest()
    e.personnages[0].apparence = 'adolescente dénudée aux cheveux argent'
    const p = promptSprite(e, e.personnages[0], 'sourire')
    expect(p.prompt).not.toMatch(/adolescente|dénudée/)
    expect(p.prompt).toMatch(/adult/)
    expect(p.prompt).toMatch(/fully clothed/)
    expect(p.negatif).toMatch(/nude/)
    expect(p.negatif).toMatch(/child/)
  })
})

describe('détourage', () => {
  it('rend le fond transparent sans trouer le personnage', () => {
    const l = 40, h = 60
    const px = new Uint8Array(l * h * 4).fill(255) // fond blanc opaque
    // Un « personnage » sombre au centre, avec un col blanc à l'intérieur.
    for (let y = 15; y < h; y++) for (let x = 12; x < 28; x++) {
      const i = (y * l + x) * 4
      const col = y > 30 && y < 36 && x > 17 && x < 23
      px[i] = px[i + 1] = px[i + 2] = col ? 255 : 40
    }
    const r = detourer(px, l, h)
    expect(detourageCredible(r)).toBe(true)
    expect(px[3]).toBe(0) // coin : transparent
    expect(px[(40 * l + 20) * 4 + 3]).toBe(255) // corps : opaque
    expect(px[(33 * l + 20) * 4 + 3]).toBe(255) // col blanc intérieur : conservé
  })

  it('juge non crédible un fond qui n’est pas uni', () => {
    const px = new Uint8Array(20 * 20 * 4)
    for (let i = 0; i < px.length; i++) px[i] = (i * 97) % 256
    expect(detourageCredible(detourer(px, 20, 20))).toBe(false)
  })
})
