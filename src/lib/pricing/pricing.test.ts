import { describe, expect, it } from 'vitest'
import { pickPrice, type CatalogCard } from './types'
import { buildQuery } from './pokemontcg'

const card: CatalogCard = {
  id: 'sv3-1',
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
