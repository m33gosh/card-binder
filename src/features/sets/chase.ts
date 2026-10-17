import type { CardRow } from '@/features/cards/types'
import type { SetCardBrief } from '@/lib/pricing'

/** A run of cards someone is trying to complete. */
export interface Chase {
  key: string
  title: string
  setId: string
  language: 'en' | 'ja'
  /** limit to these numbers (in this order); empty = the whole set */
  numbers: string[]
  note?: string
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i))

/** Runs worth chasing that aren't simply "the whole set". */
export const CHASES: Chase[] = [
  {
    key: '30th-pikachu',
    title: '30th Celebration Pikachu',
    setId: '30th',
    language: 'en',
    numbers: range(23, 52),
    note: 'One Pikachu in every pack, thirty different ones, numbers 023 to 052.',
  },
]

export const strip = (n: string) => n.replace(/^0+(?=\d)/, '').toUpperCase()

/** Does this binder row belong to the set? Works for catalog and listing ids. */
export function rowInSet(row: Pick<CardRow, 'set_id' | 'api_card_id'>, setId: string): boolean {
  if (row.set_id) return row.set_id === setId
  // older rows without a set id: the catalog id is "<set>-<number>"
  return Boolean(row.api_card_id && row.api_card_id.replace(/-[^-]+$/, '') === setId)
}

export interface Slot {
  number: string
  card: SetCardBrief | null
  owned: CardRow[]
  quantity: number
}

/** Line the set's cards up against the binder, in number order. */
export function buildSlots(setCards: SetCardBrief[], rows: CardRow[], setId: string, numbers: string[]): Slot[] {
  const inSet = rows.filter((r) => rowInSet(r, setId))
  const byNumber = new Map<string, CardRow[]>()
  for (const r of inSet) {
    const n = strip(r.card_number ?? '')
    byNumber.set(n, [...(byNumber.get(n) ?? []), r])
  }
  const cardByNumber = new Map(setCards.map((c) => [strip(c.number), c]))
  const wanted = numbers.length ? numbers.map(strip) : setCards.map((c) => strip(c.number))
  return wanted.map((n) => {
    const owned = byNumber.get(n) ?? []
    return { number: n, card: cardByNumber.get(n) ?? null, owned, quantity: owned.reduce((s, r) => s + r.quantity, 0) }
  })
}

/** Sets represented in the binder, with how many distinct numbers are held. */
export function setsInBinder(rows: CardRow[]): Array<{ setId: string; name: string; language: 'en' | 'ja'; held: number; total: number }> {
  const groups = new Map<string, { name: string; language: 'en' | 'ja'; numbers: Set<string>; total: number }>()
  for (const r of rows) {
    const setId = r.set_id ?? (r.api_card_id?.startsWith('tcgp-') ? r.api_card_id.replace(/-\d+$/, '') : r.api_card_id?.replace(/-[^-]+$/, ''))
    if (!setId) continue
    const g = groups.get(setId) ?? { name: r.set_name ?? setId, language: r.language === 'ja' ? 'ja' : 'en', numbers: new Set<string>(), total: 0 }
    g.numbers.add(strip(r.card_number ?? ''))
    groups.set(setId, g)
  }
  return [...groups.entries()].map(([setId, g]) => ({ setId, name: g.name, language: g.language, held: g.numbers.size, total: g.total })).sort((a, b) => b.held - a.held)
}
