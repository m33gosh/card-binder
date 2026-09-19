import { describe, expect, it } from 'vitest'
import { normalizeVariant, parseDamage, pickPrice, totalAttackPower, variantLabel, type CatalogCard } from './types'
import { buildQuery } from './pokemontcg'

const card: CatalogCard = {
  id: 'sv3-1',
  language: 'en',
  name: 'Test',
  number: '1',
  set: { id: 'sv3', name: 'Obsidian Flames' },
  images: { small: '', large: '' },
  prices: { normal: 0.25, reverseHolofoil: 1.1 },
}

describe('pickPrice', () => {
  it('uses the preferred variant when priced', () => {
    expect(pickPrice(card, 'reverseHolofoil', 'x')?.price).toBe(1.1)
  })
  it('falls back to the cheapest priced variant', () => {
    const quote = pickPrice(card, 'holofoil', 'x')
    expect(quote?.variant).toBe('normal')
    expect(quote?.price).toBe(0.25)
  })
  it('returns null when nothing is priced', () => {
    expect(pickPrice({ ...card, prices: {} }, 'normal', 'x')).toBeNull()
  })
})

describe('buildQuery', () => {
  it('uses a quoted prefix search for plain names', () => {
    expect(buildQuery({ name: 'Mega Lucario ex' })).toBe('name:"Mega Lucario ex*"')
    expect(buildQuery({ name: 'pikachu' })).toBe('name:"pikachu*"')
  })
  it('drops the wildcard when the name has punctuation', () => {
    expect(buildQuery({ name: 'Mr. Mime' })).toBe('name:"Mr. Mime"')
    expect(buildQuery({ name: "Farfetch'd" })).toBe(`name:"Farfetch'd"`)
  })
  it('strips characters that break the API', () => {
    expect(buildQuery({ name: 'pika*"chu' })).toBe('name:"pikachu*"')
  })
  it('adds set and number filters', () => {
    expect(buildQuery({ name: 'pikachu', setId: 'sv8', number: '57' })).toBe('name:"pikachu*" set.id:sv8 number:57')
  })
})

describe('attack power', () => {
  it('reads printed damage in all its forms', () => {
    expect(['130', '30+', '60×', '20-', '', undefined].map(parseDamage)).toEqual([130, 30, 60, 20, 0, 0])
  })
  it('adds up the attacks', () => {
    expect(totalAttackPower({ attackDamage: [130, 270] })).toBe(400)
    expect(totalAttackPower({})).toBe(0)
  })
})

describe('variants', () => {
  it('maps catalog spellings onto ours', () => {
    expect(normalizeVariant('reverse-holofoil')).toBe('reverseHolofoil')
    expect(normalizeVariant('1st-edition-holofoil')).toBe('1stEditionHolofoil')
    expect(normalizeVariant('normal')).toBe('normal')
  })
  it('labels anything', () => {
    expect(variantLabel('reverseHolofoil')).toBe('Reverse holo')
    expect(variantLabel('reverse-holofoil')).toBe('Reverse holofoil')
  })
})
