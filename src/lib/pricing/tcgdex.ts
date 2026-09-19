import { normalizeVariant, parseDamage, type CatalogCard, type CatalogLang, type CatalogSet, type PricingSource, type Variant } from './types'
import { eurToUsdRate } from '../fx'
import setCodes from './tcgdexSetCodes.json'

// codes TCGdex doesn't list but cards print
const CODE_OVERRIDES: Record<string, string> = { swshp: 'SWSH' }

// https://tcgdex.dev — free, no key, no rate limit, current sets, TCGplayer
// market prices in USD per variant. Card ids look like "me01-077" or "sm2-85".
const REST = 'https://api.tcgdex.net/v2'
const GRAPHQL = 'https://api.tcgdex.net/v2/graphql'

interface RestCard {
  id: string
  localId: string
  name: string
  rarity?: string
  image?: string
  illustrator?: string
  category?: 'Pokemon' | 'Trainer' | 'Energy' | string
  types?: string[]
  hp?: number
  attacks?: Array<{ name: string; damage?: number | string }>
  set: { id: string; name: string; cardCount?: { official?: number; total?: number } }
  pricing?: {
    tcgplayer?: { unit?: string; updated?: string } & Partial<Record<Variant, { marketPrice?: number | null }>>
    cardmarket?: { unit?: string; updated?: string; avg?: number | null; trend?: number | null; avg7?: number | null } | null
  }
}
interface BriefCard { id: string; localId: string; name: string; rarity?: string; image?: string; set: { id: string; name: string } }
interface RestSet { id: string; name: string; releaseDate?: string; cardCount?: { official?: number; total?: number }; cards: Array<{ id: string; localId: string; name: string }> }

async function withRetry<T>(run: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await run()
    } catch (e) {
      last = e
      await new Promise((r) => setTimeout(r, 600 * (i + 1)))
    }
  }
  throw last instanceof Error ? last : new Error('Card catalog request failed. Try again in a minute.')
}

async function rest<T>(path: string, lang: CatalogLang = 'en'): Promise<T | null> {
  return withRetry(async () => {
    const res = await fetch(`${REST}/${lang}${path}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Card catalog request failed (${res.status}). Try again in a minute.`)
    return (await res.json()) as T
  })
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  return withRetry(async () => {
    const res = await fetch(GRAPHQL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) })
    if (!res.ok) throw new Error(`Card catalog request failed (${res.status}). Try again in a minute.`)
    const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
    if (body.errors?.length) throw new Error(body.errors[0].message)
    return body.data as T
  })
}

const images = (base?: string) => ({ small: base ? `${base}/low.webp` : '', large: base ? `${base}/high.webp` : '' })
const supertype = (c: RestCard['category']) => (c === 'Pokemon' ? 'Pokémon' : c)

/**
 * @param eurUsd  euro → dollar rate, used when only Cardmarket (EUR) prices exist,
 *                which is the case for Japanese cards
 */
export function toCatalogCard(card: RestCard, lang: CatalogLang = 'en', eurUsd: number | null = null): CatalogCard {
  const prices: Partial<Record<Variant, number>> = {}
  const tcg = card.pricing?.tcgplayer ?? {}
  for (const [key, value] of Object.entries(tcg)) {
    const market = (value as { marketPrice?: number | null } | undefined)?.marketPrice
    if (typeof market === 'number' && market > 0) prices[normalizeVariant(key)] = market
  }
  let priceSource: string | undefined
  let priceUpdatedAt = tcg.updated
  const cm = card.pricing?.cardmarket
  if (Object.keys(prices).length === 0 && cm && eurUsd) {
    const eur = cm.trend ?? cm.avg7 ?? cm.avg
    if (typeof eur === 'number' && eur > 0) {
      prices.normal = Math.round(eur * eurUsd * 100) / 100
      priceSource = 'Cardmarket via TCGdex (EUR→USD)'
      priceUpdatedAt = cm.updated
    }
  }
  return {
    id: card.id,
    language: lang,
    name: card.name,
    number: card.localId.replace(/^0+(?=\d)/, ''),
    rarity: card.rarity,
    set: { id: card.set.id, name: card.set.name, printedTotal: card.set.cardCount?.official },
    images: images(card.image),
    supertype: supertype(card.category),
    types: card.types,
    hp: typeof card.hp === 'number' ? card.hp : undefined,
    illustrator: card.illustrator,
    attackNames: card.attacks?.map((a) => a.name),
    attackDamage: card.attacks?.map((a) => parseDamage(a.damage == null ? '' : String(a.damage))),
    prices,
    priceUpdatedAt,
    priceSource,
  }
}

/** Search results only carry the basics; prices come with getCard on selection. */
function briefToCatalogCard(card: BriefCard, lang: CatalogLang = 'en'): CatalogCard {
  return {
    id: card.id,
    language: lang,
    name: card.name,
    number: card.localId.replace(/^0+(?=\d)/, ''),
    rarity: card.rarity,
    set: { id: card.set.id, name: card.set.name },
    images: images(card.image),
    prices: {},
  }
}

const setsMemo: Partial<Record<CatalogLang, Promise<CatalogSet[]>>> = {}
const setDetail = new Map<string, Promise<RestSet | null>>()

export const tcgdexSource: PricingSource = {
  name: 'TCGplayer via TCGdex',

  async search({ name, number, page = 1, lang = 'en' }) {
    const q = name.trim()
    if (!q) return []
    if (lang === 'ja') {
      // the GraphQL endpoint is English-only; the REST search is fine for Japanese names
      const list = (await rest<Array<{ id: string; localId: string; name: string; image?: string }>>(`/cards?name=${encodeURIComponent(q)}&pagination:itemsPerPage=60`, 'ja')) ?? []
      const sets = await this.listSets('ja')
      const byId = new Map(sets.map((s) => [s.id.toLowerCase(), s]))
      let cards = list.map((c) => briefToCatalogCard({ ...c, set: { id: c.id.split('-')[0], name: byId.get(c.id.split('-')[0].toLowerCase())?.name ?? c.id.split('-')[0] } }, 'ja'))
      if (number?.trim()) {
        const n = number.trim().replace(/^0+(?=\d)/, '').toUpperCase()
        cards = cards.filter((c) => c.number.toUpperCase() === n)
      }
      const order = new Map(sets.map((s) => [s.id.toLowerCase(), s.releaseDate ?? '']))
      return cards.sort((a, b) => (order.get(b.set.id.toLowerCase()) ?? '').localeCompare(order.get(a.set.id.toLowerCase()) ?? '')).slice(0, 24)
    }
    const data = await graphql<{ cards: BriefCard[] | null }>(
      `query ($name: String, $page: Int!, $size: Int!) {
        cards(filters: { name: $name }, pagination: { page: $page, itemsPerPage: $size }) {
          id name localId rarity image set { id name }
        }
      }`,
      { name: q, page, size: 60 },
    )
    let cards = (data.cards ?? []).map((c) => briefToCatalogCard(c, 'en'))
    if (number?.trim()) {
      const n = number.trim().replace(/^0+(?=\d)/, '')
      cards = cards.filter((c) => c.number.toUpperCase() === n.toUpperCase())
    }
    // newest set first, so today's cards come before 2005's
    const sets = await this.listSets()
    const date = new Map(sets.map((s) => [s.id, s.releaseDate ?? '']))
    return cards.sort((a, b) => (date.get(b.set.id) ?? '').localeCompare(date.get(a.set.id) ?? '')).slice(0, 24)
  },

  async getCard(id, lang = 'en') {
    const card = await rest<RestCard>(`/cards/${encodeURIComponent(id)}`, lang)
    if (!card) return null
    const rate = lang === 'ja' ? await eurToUsdRate() : null
    return toCatalogCard(card, lang, rate)
  },

  async listSets(lang = 'en') {
    if (lang === 'ja') {
      // no release dates in the brief list, but it is in release order: use the position
      setsMemo.ja ??= rest<Array<{ id: string; name: string; cardCount?: { official?: number; total?: number } }>>('/sets', 'ja').then((list) =>
        (list ?? []).map((s, i) => ({
          id: s.id,
          name: s.name,
          releaseDate: String(i).padStart(5, '0'),
          printedTotal: s.cardCount?.official ?? s.cardCount?.total,
          ptcgoCode: s.id, // Japanese cards print the set id itself, e.g. SV4a
        })),
      )
      setsMemo.ja.catch(() => delete setsMemo.ja)
      return setsMemo.ja
    }
    if (!setsMemo.en) {
      setsMemo.en = graphql<{ sets: Array<{ id: string; name: string; releaseDate?: string; cardCount?: { official?: number }; serie?: { id: string } }> }>(
        `{ sets { id name releaseDate cardCount { official } serie { id } } }`,
        {},
      ).then((data) =>
        data.sets.map((s) => ({
          id: s.id,
          name: s.name,
          series: s.serie?.id,
          releaseDate: s.releaseDate,
          printedTotal: s.cardCount?.official,
          ptcgoCode: CODE_OVERRIDES[s.id] ?? (setCodes as Record<string, string>)[s.id],
        })),
      )
      setsMemo.en.catch(() => delete setsMemo.en)
    }
    return setsMemo.en
  },

  async findByNumber(number, setIds, lang = 'en') {
    const n = number.trim().replace(/^0+(?=\d)/, '').toUpperCase()
    if (!n || setIds.length === 0) return []
    const hits: string[] = []
    for (const setId of setIds) {
      const key = `${lang}:${setId}`
      if (!setDetail.has(key)) setDetail.set(key, rest<RestSet>(`/sets/${encodeURIComponent(setId)}`, lang))
      const set = await setDetail.get(key)!
      for (const c of set?.cards ?? []) if (c.localId.replace(/^0+(?=\d)/, '').toUpperCase() === n) hits.push(c.id)
    }
    const cards = await Promise.all(hits.map((id) => this.getCard(id, lang)))
    return cards.filter((c): c is CatalogCard => c !== null)
  },
}
