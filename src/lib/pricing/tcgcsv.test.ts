import { describe, expect, it } from 'vitest'
import { groupCode, orderGroups, parseAttack, productToCard } from './tcgcsv'

const group = { groupId: 24722, name: 'ME: 30th Celebration', publishedOn: '2026-09-16T00:00:00' }
const product = {
  productId: 696676,
  name: 'Greninja ex - 021/128',
  imageUrl: 'https://tcgplayer-cdn.tcgplayer.com/product/696676_200w.jpg',
  extendedData: [
    { name: 'Number', value: '021/128' }, { name: 'Rarity', value: 'Double Rare' }, { name: 'Card Type', value: 'Water' }, { name: 'HP', value: '300' },
    { name: 'Attack 1', value: "[W] Stealthy Slash<br> This attack does 30 damage to 1 of your opponent's Pokémon" }, { name: 'Attack 2', value: '[WW] Aqua Edge (160)' },
  ],
}
const prices = [{ productId: 696676, subTypeName: 'Holofoil', marketPrice: 0.76 }, { productId: 1, subTypeName: 'Normal', marketPrice: 9 }]

describe('tcgplayer mirror mapping', () => {
  it('turns a listing into a catalog card', () => {
    const card = productToCard(product, group, 3, prices)!
    expect(card.id).toBe('tcgp-3-24722-696676')
    expect(card.name).toBe('Greninja ex')
    expect(card.number).toBe('21')
    expect(card.set.printedTotal).toBe(128)
    expect(card.set.name).toBe('30th Celebration')
    expect(card.hp).toBe(300)
    expect(card.types).toEqual(['Water'])
    expect(card.attackNames).toEqual(['Stealthy Slash', 'Aqua Edge'])
    expect(card.attackDamage).toEqual([0, 160])
    expect(card.prices).toEqual({ holofoil: 0.76 })
    expect(card.images.large).toContain('696676_400w.jpg')
  })
  it('skips sealed products and stickers', () => {
    expect(productToCard({ productId: 1, name: '30th Celebration Booster Pack', extendedData: [] }, group, 3, [])).toBeNull()
  })
  it('reads Japanese listings with English names', () => {
    const card = productToCard({ productId: 716804, name: 'Alolan Exeggutor - 002/103', extendedData: [{ name: 'Number', value: '002/103' }, { name: 'HP', value: '150' }] }, { groupId: 24721, name: 'M6a: MEGA Expansion 30th Celebration' }, 85, [])!
    expect(card.language).toBe('ja')
    expect(card.name).toBe('Alolan Exeggutor')
    expect(card.number).toBe('2')
    expect(card.set.name).toBe('MEGA Expansion 30th Celebration')
  })
  it('parses attacks and set codes', () => {
    expect(parseAttack('[WW] Aqua Edge (160)')).toEqual({ name: 'Aqua Edge', damage: 160 })
    expect(parseAttack('[C] Gnaw (10+)')).toEqual({ name: 'Gnaw', damage: 10 })
    expect(groupCode({ groupId: 1, name: 'M6a: MEGA Expansion 30th Celebration' })).toBe('M6a')
    expect(groupCode({ groupId: 1, name: 'Celebrations' })).toBeUndefined()
  })
})

describe('orderGroups', () => {
  it('puts proper sets before promo collections published later', () => {
    const now = Date.parse('2026-09-21T12:00:00Z')
    const groups = [
      { groupId: 1, name: 'CoroCoro Promotional Cards', publishedOn: '2026-09-21T00:00:00' },
      { groupId: 2, name: 'Battle Road', publishedOn: '2026-09-21T00:00:00' },
      { groupId: 3, name: 'M6a: MEGA Expansion 30th Celebration', publishedOn: '2026-09-16T00:00:00' },
      { groupId: 4, name: 'M6: Storm Emeralda', publishedOn: '2026-07-31T00:00:00' },
      { groupId: 5, name: 'S8a: 25th Anniversary Collection', publishedOn: '2021-10-22T00:00:00' },
    ]
    expect(orderGroups(groups, now).map((g) => g.groupId)).toEqual([3, 4, 1, 2])
  })
})
