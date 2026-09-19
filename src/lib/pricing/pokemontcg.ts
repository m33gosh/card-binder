import { parseDamage, type CatalogCard, type CatalogSet, type PricingSource, type Variant } from './types'

// https://docs.pokemontcg.io — free, CORS-friendly, TCGplayer market prices.
// Without a key you get 1,000 requests/day, plenty for a family binder.
const BASE = 'https://api.pokemontcg.io/v2'
const API_KEY = (import.meta.env.VITE_POKEMONTCG_API_KEY as string | undefined) || undefined

interface ApiPriceBlock { low?: number; mid?: number; high?: number; market?: number }
interface ApiCard {
  id: string
  name: string
  number: string
  rarity?: string
  set: { id: string; name: string; series: string; printedTotal: number; releaseDate: string }
  images: { small: string; large: string }
  supertype?: string
  types?: string[]
  hp?: string
  attacks?: Array<{ name: string; damage?: string }>
  tcgplayer?: { url?: string; updatedAt?: string; prices?: Partial<Record<Variant, ApiPriceBlock>> }
  cardmarket?: { url?: string; updatedAt?: string; prices?: { averageSellPrice?: number; trendPrice?: number } }
}

async function request<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(BASE + path)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
  }
  const headers: Record<string, string> = {}
  if (API_KEY) headers['X-Api-Key'] = API_KEY
  let res = await fetch(url, { headers })
  if (res.status >= 500) {
    // the free API hiccups now and then; one retry clears most of it
    await new Promise((r) => setTimeout(r, 800))
    res = await fetch(url, { headers })
  }
  if (res.status === 404) return { data: null } as T
  if (!res.ok) throw new Error(`Card catalog request failed (${res.status}). Try again in a minute.`)
  return (await res.json()) as T
}

export function toCatalogCard(card: ApiCard): CatalogCard {
  const prices: Partial<Record<Variant, number>> = {}
  for (const [variant, block] of Object.entries(card.tcgplayer?.prices ?? {})) {
    if (block?.market != null) prices[variant as Variant] = block.market
  }
  return {
    id: card.id,
    name: card.name,
    number: card.number,
    rarity: card.rarity,
    set: {
      id: card.set.id,
      name: card.set.name,
      series: card.set.series,
      printedTotal: card.set.printedTotal,
      releaseDate: card.set.releaseDate,
    },
    images: card.images,
    supertype: card.supertype,
    types: card.types,
    hp: card.hp && /^\d+$/.test(card.hp) ? Number(card.hp) : undefined,
    attackDamage: card.attacks?.map((a) => parseDamage(a.damage)),
    prices,
    priceUpdatedAt: card.tcgplayer?.updatedAt,
    sourceUrl: card.tcgplayer?.url,
  }
}

/**
 * Build a query the API understands. Learned the hard way:
 *  - a quoted phrase with a trailing * works ("Mega Lucario*")
 *  - several name: terms, or punctuation next to a *, make the API 500
 *  - an exact quoted phrase copes with punctuation ("Mr. Mime", "Farfetch'd")
 */
export function buildQuery(input: { name: string; setId?: string; number?: string }): string {
  const parts: string[] = []
  const name = input.name.trim().replace(/["*]/g, '')
  if (name) {
    const plain = /^[\p{L}\p{N}\s-]+$/u.test(name)
    parts.push(plain ? `name:"${name}*"` : `name:"${name}"`)
  }
  if (input.setId) parts.push(`set.id:${input.setId}`)
  if (input.number?.trim()) parts.push(`number:${input.number.trim()}`)
  return parts.join(' ')
}

export const pokemonTcgSource: PricingSource = {
  name: 'TCGplayer via pokemontcg.io',

  async search({ name, setId, number, page = 1 }) {
    const q = buildQuery({ name, setId, number })
    if (!q) return []
    const body = await request<{ data: ApiCard[] }>('/cards', {
      q,
      page,
      pageSize: 24,
      orderBy: '-set.releaseDate',
      select: 'id,name,number,rarity,set,images,supertype,types,hp,attacks,tcgplayer',
    })
    return (body.data ?? []).map(toCatalogCard)
  },

  async getCard(id) {
    const body = await request<{ data: ApiCard | null }>(`/cards/${encodeURIComponent(id)}`, {
      select: 'id,name,number,rarity,set,images,supertype,types,hp,attacks,tcgplayer',
    })
    return body.data ? toCatalogCard(body.data) : null
  },

  async listSets() {
    const body = await request<{ data: CatalogSet[] }>('/sets', {
      orderBy: '-releaseDate',
      select: 'id,name,series,releaseDate,ptcgoCode,printedTotal',
      pageSize: 250,
    })
    return body.data ?? []
  },

  async findByNumber(number, setIds) {
    if (!number.trim() || setIds.length === 0) return []
    const sets = setIds.map((id) => `set.id:${id}`).join(' OR ')
    const body = await request<{ data: ApiCard[] }>('/cards', {
      q: `number:${number.trim()} (${sets})`,
      pageSize: 24,
      orderBy: '-set.releaseDate',
      select: 'id,name,number,rarity,set,images,supertype,types,hp,attacks,tcgplayer',
    })
    return (body.data ?? []).map(toCatalogCard)
  },
}
