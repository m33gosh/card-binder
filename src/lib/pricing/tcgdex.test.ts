import { describe, expect, it } from 'vitest'
import { toCatalogCard } from './tcgdex'

describe('tcgdex mapping', () => {
  it('maps a modern card with prices and stats', () => {
    const card = toCatalogCard({
      id: 'me01-077', localId: '077', name: 'Mega Lucario ex', rarity: 'Double rare', image: 'https://assets.tcgdex.net/en/me/me01/077',
      category: 'Pokemon', types: ['Fighting'], hp: 340, attacks: [{ name: 'Aura Jab', damage: 130 }, { name: 'Mega Brave', damage: '270' }],
      set: { id: 'me01', name: 'Mega Evolution', cardCount: { official: 132, total: 188 } },
      pricing: { tcgplayer: { unit: 'USD', updated: '2026-09-18', holofoil: { marketPrice: 0.84 }, normal: { marketPrice: null }, 'reverse-holofoil': { marketPrice: 1.5 } } as never },
    })
    expect(card.number).toBe('77')
    expect(card.language).toBe('en')
    expect(card.set.printedTotal).toBe(132)
    expect(card.images.large).toBe('https://assets.tcgdex.net/en/me/me01/077/high.webp')
    expect(card.supertype).toBe('Pokémon')
    expect(card.attackDamage).toEqual([130, 270])
    expect(card.prices).toEqual({ holofoil: 0.84, reverseHolofoil: 1.5 })
  })
  it('copes with a trainer that has no stats or prices', () => {
    const card = toCatalogCard({ id: 'sv01-194', localId: '194', name: 'Switch', category: 'Trainer', set: { id: 'sv01', name: 'Scarlet & Violet' } })
    expect(card.supertype).toBe('Trainer')
    expect(card.hp).toBeUndefined()
    expect(card.prices).toEqual({})
    expect(card.images.small).toBe('')
  })
})

describe('japanese cards', () => {
  it('converts a Cardmarket euro price when there is no TCGplayer price', () => {
    const card = toCatalogCard(
      { id: 'SV4a-205', localId: '205', name: 'オリーヴァ', category: 'Pokemon', hp: 150, set: { id: 'SV4a', name: 'レイジングサーフ', cardCount: { official: 190 } }, pricing: { tcgplayer: undefined, cardmarket: { unit: 'EUR', updated: '2026-09-18', trend: 1.1, avg: 1.19 } } },
      'ja',
      1.146,
    )
    expect(card.language).toBe('ja')
    expect(card.prices.normal).toBe(1.26)
    expect(card.priceSource).toContain('Cardmarket')
  })
  it('leaves the price empty when no rate is known', () => {
    const card = toCatalogCard({ id: 'SV4a-205', localId: '205', name: 'x', set: { id: 'SV4a', name: 'y' }, pricing: { cardmarket: { trend: 1.1 } } }, 'ja', null)
    expect(card.prices).toEqual({})
  })
})
