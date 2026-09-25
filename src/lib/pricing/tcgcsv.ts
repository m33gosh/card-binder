// Second catalog: TCGplayer's listings via tcgcsv.com, through the
// catalog-mirror Edge Function. It has new sets on release day (both English
// and Japanese) with numbers, images and dollar prices, but no illustrator or
// full card text, so the main catalog stays first and this fills the gaps.
import { supabase } from '../supabase'
import { normalizeVariant, parseDamage, type CatalogCard, type CatalogLang, type CatalogSet, type Variant } from './types'

const CATEGORY: Record<CatalogLang, number> = { en: 3, ja: 85 }
const LANG_OF: Record<string, CatalogLang> = { '3': 'en', '85': 'ja' }
const RECENT_DAYS = 240
const MAX_GROUPS = 24

interface Group { groupId: number; name: string; abbreviation?: string; publishedOn?: string }
interface Product { productId: number; name: string; imageUrl?: string; extendedData?: Array<{ name: string; value: string }> }
interface PriceRow { productId: number; subTypeName: string; marketPrice?: number | null }

const memo = new Map<string, Promise<unknown>>()

// Only the small group lists go in browser storage. Product and price lists
// run to hundreds of kilobytes each; on iPad Safari they filled the storage
// quota, after which nothing else could be saved — including the login.
const persistable = (path: string) => path.endsWith('/groups')
try {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('card-binder:mirror:') && !persistable(key.slice('card-binder:mirror:'.length))) localStorage.removeItem(key)
  }
} catch {
  /* no storage */
}

async function mirror<T>(path: string): Promise<T> {
  const key = `card-binder:mirror:${path}`
  if (!memo.has(key)) {
    memo.set(
      key,
      (async () => {
        if (persistable(path)) {
          try {
            const raw = localStorage.getItem(key)
            if (raw) {
              const { at, data } = JSON.parse(raw) as { at: number; data: T }
              if (Date.now() - at < 6 * 3600 * 1000) return data
            }
          } catch {
            /* no storage */
          }
        }
        const { data, error } = await supabase.functions.invoke<{ results?: T; error?: string }>('catalog-mirror', { body: { path } })
        if (error) throw new Error(error.message)
        if (!data?.results) throw new Error(data?.error ?? 'Mirror unavailable')
        if (persistable(path)) {
          try {
            localStorage.setItem(key, JSON.stringify({ at: Date.now(), data: data.results }))
          } catch {
            /* ignore */
          }
        }
        return data.results
      })(),
    )
    memo.get(key)!.catch(() => memo.delete(key))
  }
  return memo.get(key) as Promise<T>
}

/**
 * Sets published in the last few months, newest first, with proper sets
 * ("M6a: …", "SV11W: …") ahead of promo and deck collections: the mirror
 * bulk-publishes dozens of promo groups on one day, and cards printed N/T
 * almost always belong to a proper set.
 */
export function orderGroups(groups: Group[], now = Date.now()): Group[] {
  const since = now - RECENT_DAYS * 24 * 3600 * 1000
  const recent = groups.filter((g) => g.publishedOn && Date.parse(g.publishedOn) >= since)
  const isSet = (g: Group) => Boolean(groupCode(g)) && !/promo|deck|box|collection box|bundle/i.test(g.name)
  return recent
    .sort((a, b) => Number(isSet(b)) - Number(isSet(a)) || (b.publishedOn ?? '').localeCompare(a.publishedOn ?? ''))
    .slice(0, MAX_GROUPS)
}

export async function recentGroups(lang: CatalogLang): Promise<Group[]> {
  return orderGroups(await mirror<Group[]>(`${CATEGORY[lang]}/groups`))
}

const field = (p: Product, name: string) => p.extendedData?.find((e) => e.name === name)?.value
const strip = (n: string) => n.replace(/^0+(?=\d)/, '')
const ENERGY_TYPES = new Set(['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Fairy', 'Dragon', 'Colorless'])

/** "[WW] Aqua Edge (160)" → { name: "Aqua Edge", damage: 160 } */
export function parseAttack(value: string): { name: string; damage: number } | null {
  const text = value.replace(/<br\s*\/?>.*$/is, '').trim()
  const m = /^(?:\[[^\]]*\]\s*)?([^(]+?)\s*(?:\((\d+[+×x\-]?)\))?$/.exec(text)
  if (!m || !m[1].trim()) return null
  return { name: m[1].trim(), damage: parseDamage(m[2]) }
}

export function productToCard(p: Product, group: Group, category: number, prices: PriceRow[]): CatalogCard | null {
  const numberField = field(p, 'Number')
  if (!numberField) return null // sealed products, stickers, etc.
  const [num, total] = numberField.split('/')
  const priced: Partial<Record<Variant, number>> = {}
  for (const row of prices) {
    if (row.productId !== p.productId || !row.marketPrice || row.marketPrice <= 0) continue
    priced[normalizeVariant(row.subTypeName)] = row.marketPrice
  }
  const hp = field(p, 'HP')
  const cardType = field(p, 'Card Type')
  const attacks = [1, 2, 3, 4].map((i) => field(p, `Attack ${i}`)).filter((v): v is string => Boolean(v)).map(parseAttack).filter((a): a is { name: string; damage: number } => a !== null)
  const image = p.imageUrl?.replace(/_\d+w\.jpg$/, '')
  return {
    id: `tcgp-${category}-${group.groupId}-${p.productId}`,
    language: LANG_OF[String(category)] ?? 'en',
    name: p.name.replace(/\s+-\s+[A-Za-z]*\d{1,3}\/\d{1,3}.*$/, '').replace(/\s*\[.*\]$/, '').trim(),
    number: strip(num.trim()),
    rarity: field(p, 'Rarity'),
    set: { id: `tcgp-${category}-${group.groupId}`, name: group.name.replace(/^[A-Za-z0-9.-]{1,8}:\s*/, ''), printedTotal: total ? Number(strip(total.trim())) : undefined },
    images: { small: image ? `${image}_200w.jpg` : '', large: image ? `${image}_400w.jpg` : '' },
    supertype: hp ? 'Pokémon' : /energy/i.test(p.name) ? 'Energy' : 'Trainer',
    types: cardType && ENERGY_TYPES.has(cardType) ? [cardType] : undefined,
    hp: hp && /^\d+$/.test(hp) ? Number(hp) : undefined,
    attackNames: attacks.map((a) => a.name),
    attackDamage: attacks.map((a) => a.damage),
    prices: priced,
    priceSource: 'TCGplayer via tcgcsv.com',
  }
}

async function groupCards(lang: CatalogLang, group: Group): Promise<CatalogCard[]> {
  const cat = CATEGORY[lang]
  const [products, prices] = await Promise.all([mirror<Product[]>(`${cat}/${group.groupId}/products`), mirror<PriceRow[]>(`${cat}/${group.groupId}/prices`).catch(() => [] as PriceRow[])])
  return products.map((p) => productToCard(p, group, cat, prices)).filter((c): c is CatalogCard => c !== null)
}

/** Printed set code from a group name like "M6a: MEGA Expansion 30th Celebration" or "M-P Promotional Cards". */
export function groupCode(group: Group): string | undefined {
  const m = /^([A-Za-z0-9.-]{1,8}):\s/.exec(group.name) ?? /^([A-Za-z0-9-]{2,6})\s+Promo/i.exec(group.name)
  return m?.[1] ?? group.abbreviation
}

/** The main catalog's promo set ids versus the codes printed on the cards and used in listings. */
export const SET_CODE_ALIASES: Record<string, string> = { mep: 'M-P', svp: 'SV-P', smp: 'SM-P', swshp: 'SWSH', sp: 'S-P' }
export const codeAliases = (setId: string) => [setId, SET_CODE_ALIASES[setId.toLowerCase()]].filter((c): c is string => Boolean(c))

export const tcgplayerMirror = {
  name: 'TCGplayer via tcgcsv.com',

  /** Cards printed N/T in recent sets, newest set first; a code narrows to that set. */
  async findByPrintedNumber(number: string, total: string | undefined, lang: CatalogLang, code?: string): Promise<CatalogCard[]> {
    const n = strip(number).toUpperCase()
    const groups = await recentGroups(lang)
    const all = code ? await mirror<Group[]>(`${CATEGORY[lang]}/groups`) : []
    const byCode = code ? all.filter((g) => groupCode(g)?.toUpperCase() === code.toUpperCase()) : []
    const out: CatalogCard[] = []
    for (const g of byCode.length ? byCode : groups) {
      const cards = await groupCards(lang, g)
      for (const c of cards) {
        if (c.number.toUpperCase() !== n) continue
        if (total && c.set.printedTotal != null && String(c.set.printedTotal) !== strip(total)) continue
        out.push(c)
      }
      if (out.length && (byCode.length || total)) break // exact enough; don't scan older sets
    }
    return out
  },

  async search(name: string, lang: CatalogLang): Promise<CatalogCard[]> {
    const q = name.trim().toLowerCase()
    if (q.length < 2) return []
    const out: CatalogCard[] = []
    for (const g of await recentGroups(lang)) {
      for (const c of await groupCards(lang, g)) if (c.name.toLowerCase().includes(q)) out.push(c)
      if (out.length >= 24) break
    }
    return out.slice(0, 24)
  },

  async getCard(id: string): Promise<CatalogCard | null> {
    const m = /^tcgp-(\d+)-(\d+)-(\d+)$/.exec(id)
    if (!m) return null
    const lang = LANG_OF[m[1]] ?? 'en'
    const groups = await mirror<Group[]>(`${m[1]}/groups`)
    const group = groups.find((g) => g.groupId === Number(m[2]))
    if (!group) return null
    return (await groupCards(lang, group)).find((c) => c.id === id) ?? null
  },

  /** Every set the listings know for this language (not just recent ones). */
  async listSets(lang: CatalogLang): Promise<CatalogSet[]> {
    const groups = await mirror<Group[]>(`${CATEGORY[lang]}/groups`)
    return groups.map((g) => ({ id: `tcgp-${CATEGORY[lang]}-${g.groupId}`, name: g.name, releaseDate: g.publishedOn, ptcgoCode: groupCode(g) }))
  },
}
