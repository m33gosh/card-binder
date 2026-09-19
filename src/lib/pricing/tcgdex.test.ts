import { describe, expect, it } from 'vitest'
import { toCatalogCard } from './tcgdex'

describe('tcgdex mapping', () => {
  it('maps a modern card with prices and stats', () => {
    const card = toCatalogCard({
      id: 'me01-077', localId: '077', name: 'Mega Lucario ex', rarity: 'Double rare', image: 'https://assets.tcgdex.net/en/me/me01/077',
      category: 'Pokemon', types: ['Fighting'], hp: 340, attacks: [{ name: 'Aura Jab', damage: 130 }, { name: 'Mega Brave', damage: '270' }],
      set: { id: 'me01', name: 'Mega Evolution', cardCount: { official: 132, total: 188 } },
      pricing: { tcgplayer: { unit: 'USD', updated: '2026-09-18', holofoil: { marketPrice: 0.84 }, normal: { marketPrice: null } } },
    })
    expect(card.number).toBe('77')
    expect(card.set.printedTotal).toBe(132)
    expect(card.images.large).toBe('https://assets.tcgdex.net/en/me/me01/077/high.webp')
    expect(card.supertype).toBe('Pokémon')
    expect(card.attackDamage).toEqual([130, 270])
    expect(card.prices).toEqual({ holofoil: 0.84 })
  })
  it('copes with a trainer that has no stats or prices', () => {
    const card = toCatalogCard({ id: 'sv01-194', localId: '194', name: 'Switch', category: 'Trainer', set: { id: 'sv01', name: 'Scarlet & Violet' } })
    expect(card.supertype).toBe('Trainer')
    expect(card.hp).toBeUndefined()
    expect(card.prices).toEqual({})
    expect(card.images.small).toBe('')
  })
})
