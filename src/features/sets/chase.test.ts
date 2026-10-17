import { describe, expect, it } from 'vitest'
import { buildSlots, rowInSet, setsInBinder } from './chase'
import type { CardRow } from '@/features/cards/types'

const row = (name: string, number: string, set_id: string, api: string, quantity = 1): CardRow =>
  ({ id: api, owner_id: 'u', name, name_alt: null, set_name: 'S', set_id, card_number: number, rarity: null, api_card_id: api, api_image_url: null, image_path: null, variant: 'normal', condition: 'near_mint', quantity, market_price: null, price_currency: 'USD', price_source: null, price_updated_at: null, notes: null, supertype: null, types: null, hp: null, attack_power: null, language: 'en', created_at: '', updated_at: '' }) as CardRow

describe('chase lists', () => {
  const rows = [row('Pikachu', '27', '30th', '30th-027'), row('Pikachu', '32', '30th', '30th-032', 2), row('Gengar', '18', '30th-c', '30th-c-018'), row('Mew', '56', 'tcgp-85-24721', 'tcgp-85-24721-716858')]
  it('tells which rows belong to a set, including listing sets', () => {
    expect(rowInSet(rows[0], '30th')).toBe(true)
    expect(rowInSet(rows[2], '30th')).toBe(false)
    expect(rowInSet(rows[3], 'tcgp-85-24721')).toBe(true)
  })
  it('lines the wanted numbers up against the binder', () => {
    const cards = ['23', '27', '32', '46'].map((n) => ({ id: '30th-' + n, number: n, name: 'Pikachu', image: '' }))
    const slots = buildSlots(cards, rows, '30th', ['23', '27', '32', '46'])
    expect(slots.map((s) => s.quantity)).toEqual([0, 1, 2, 0])
    expect(slots[1].card?.id).toBe('30th-27')
  })
  it('counts distinct numbers held per set, merging catalog and listing ids of one set', () => {
    const more = [...rows, { ...row('Zekrom', '56', 'tcgp-3-24722', 'tcgp-3-24722-1'), set_name: '30th Celebration' }, { ...rows[0], set_name: '30th Celebration' }, { ...rows[1], set_name: '30th Celebration' }]
    const sets = setsInBinder(more)
    const thirtieth = sets.find((s) => s.name === '30th Celebration')!
    expect(thirtieth.setIds).toEqual(['30th', 'tcgp-3-24722'])
    expect(thirtieth.held).toBe(3)
    expect(rowInSet(more[4], thirtieth.setIds)).toBe(true)
  })
})
