import type { CardRow } from '@/features/cards/types'
import type { SetCardBrief } from '@/lib/pricing'

/** A run of cards someone is trying to complete. */
export interface Chase {
  key: string
  title: string
  /** the set in the catalog; the first id is used for the card list */
  setId: string
  /** other ids the same set goes by (listing ids, older catalog ids) */
  alsoIds?: string[]
  language: 'en' | 'ja'
  /** limit to these numbers (in this order); empty = the whole set */
  numbers: string[]
  note?: string
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i))

/** Runs worth chasing that aren't simply "the whole set". */
export const CHASES: Chase[] = [
  {
    key: '30th-pikachu-ja',
    title: '30th Celebration Pikachu (Japanese)',
    setId: 'tcgp-85-24721',
    language: 'ja',
    numbers: range(17, 46),
    note: 'MEGA Expansion 30th Celebration: one Pikachu in every pack, thirty different ones, numbers 017 to 046.',
  },
  {
    key: '30th-pikachu',
    title: '30th Celebration Pikachu (English)',
    setId: '30th',
    alsoIds: ['tcgp-3-24722'],
    language: 'en',
    numbers: range(23, 52),
    note: 'The English set: thirty different Pikachu, numbers 023 to 052.',
  },
]

export const strip = (n: string) => n.replace(/^0+(?=\d)/, '').toUpperCase()

/** Does this binder row belong to the set? Works for catalog and listing ids. */
export function rowInSet(row: Pick<CardRow, 'set_id' | 'api_card_id'>, setId: string | string[]): boolean {
  const ids = Array.isArray(setId) ? setId : [setId]
  if (row.set_id) return ids.includes(row.set_id)
  // older rows without a set id: the catalog id is "<set>-<number>"
  return Boolean(row.api_card_id && ids.includes(row.api_card_id.replace(/-[^-]+$/, '')))
}

export interface Slot {
  number: string
  card: SetCardBrief | null
  owned: CardRow[]
  quantity: number
}

/** Line the set's cards up against the binder, in number order. */
export function buildSlots(setCards: SetCardBrief[], rows: CardRow[], setId: string | string[], numbers: string[]): Slot[] {
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

/**
 * Sets represented in the binder, with how many distinct numbers are held.
 * The same set can be reached through the main catalog or the listings, with
 * different ids, so sets are grouped by name and language and carry every id.
 */
export function setsInBinder(rows: CardRow[]): Array<{ setIds: string[]; name: string; language: 'en' | 'ja'; held: number }> {
  const groups = new Map<string, { name: string; language: 'en' | 'ja'; ids: Set<string>; numbers: Set<string> }>()
  for (const r of rows) {
    const setId = r.set_id ?? (r.api_card_id?.startsWith('tcgp-') ? r.api_card_id.replace(/-\d+$/, '') : r.api_card_id?.replace(/-[^-]+$/, ''))
    if (!setId) continue
    const language = r.language === 'ja' ? 'ja' : 'en'
    const name = (r.set_name ?? setId).trim()
    const key = `${language}:${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`
    const g = groups.get(key) ?? { name, language, ids: new Set<string>(), numbers: new Set<string>() }
    g.ids.add(setId)
    g.numbers.add(strip(r.card_number ?? ''))
    groups.set(key, g)
  }
  return [...groups.values()]
    .map((g) => ({
      // catalog ids first: they give the fuller card list
      setIds: [...g.ids].sort((a, b) => Number(a.startsWith('tcgp-')) - Number(b.startsWith('tcgp-'))),
      name: g.name,
      language: g.language,
      held: g.numbers.size,
    }))
    .sort((a, b) => b.held - a.held)
}
