// A pricing source turns "which card is this" into "what's it worth today".
// Swap the implementation in ./index.ts if pokemontcg.io ever stops fitting.

export type Variant =
  | 'normal'
  | 'holofoil'
  | 'reverseHolofoil'
  | '1stEditionHolofoil'
  | '1stEditionNormal'
  | 'unlimited'

/** The finishes a person can pick for any card, whether or not the catalog prices them. */
export const STANDARD_VARIANTS: Variant[] = ['normal', 'holofoil', 'reverseHolofoil']

/** Catalogs spell variants differently ("reverse-holofoil"); map them onto ours. */
export function normalizeVariant(key: string): Variant {
  const k = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  const table: Record<string, Variant> = {
    normal: 'normal',
    holofoil: 'holofoil',
    holo: 'holofoil',
    reverseholofoil: 'reverseHolofoil',
    reverseholo: 'reverseHolofoil',
    reverse: 'reverseHolofoil',
    '1steditionholofoil': '1stEditionHolofoil',
    firsteditionholofoil: '1stEditionHolofoil',
    '1steditionnormal': '1stEditionNormal',
    '1stedition': '1stEditionNormal',
    firstedition: '1stEditionNormal',
    unlimited: 'unlimited',
  }
  return table[k] ?? (key as Variant)
}

/** Label for any variant, including ones we didn't anticipate. */
export function variantLabel(v: string): string {
  return VARIANT_LABELS[v as Variant] ?? v.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase())
}

export const VARIANT_LABELS: Record<Variant, string> = {
  normal: 'Regular',
  holofoil: 'Holo',
  reverseHolofoil: 'Reverse holo',
  '1stEditionHolofoil': '1st edition holo',
  '1stEditionNormal': '1st edition',
  unlimited: 'Unlimited',
}

export type CatalogLang = 'en' | 'ja'

export interface CatalogCard {
  id: string
  /** which catalog the id belongs to; Japanese cards have their own sets and numbers */
  language: CatalogLang
  name: string
  /** the English name of a Japanese card, when known */
  nameAlt?: string
  /** National Pokédex numbers, when the catalog knows them */
  dexIds?: number[]
  number: string
  rarity?: string
  set: { id: string; name: string; series?: string; printedTotal?: number; releaseDate?: string }
  images: { small: string; large: string }
  supertype?: 'Pokémon' | 'Trainer' | 'Energy' | string
  /** energy types, e.g. ["Fire"]; Pokémon only */
  types?: string[]
  hp?: number
  illustrator?: string
  attackNames?: string[]
  /** printed damage of each attack, already parsed ("30+" → 30) */
  attackDamage?: number[]
  /** market price per variant, in USD, when the source knows it */
  prices: Partial<Record<Variant, number>>
  priceUpdatedAt?: string
  /** where the price came from, when it differs from the source's usual */
  priceSource?: string
  sourceUrl?: string
}

export interface PriceQuote {
  price: number
  currency: string
  variant: Variant
  source: string
  updatedAt?: string
}

export interface PricingSource {
  readonly name: string
  search(query: { name: string; setId?: string; number?: string; page?: number; lang?: CatalogLang }): Promise<CatalogCard[]>
  getCard(id: string, lang?: CatalogLang): Promise<CatalogCard | null>
  listSets(lang?: CatalogLang): Promise<CatalogSet[]>
  /** cards with this collector number in any of the given sets */
  findByNumber(number: string, setIds: string[], lang?: CatalogLang): Promise<CatalogCard[]>
}

export interface CatalogSet {
  id: string
  name: string
  series?: string
  releaseDate?: string
  ptcgoCode?: string
  printedTotal?: number
}

/** "130" → 130, "30+" → 30, "60×" → 60, "" → 0 */
export function parseDamage(text: string | undefined): number {
  const m = /\d+/.exec(text ?? '')
  return m ? Number(m[0]) : 0
}

export function totalAttackPower(card: Pick<CatalogCard, 'attackDamage'>): number {
  return (card.attackDamage ?? []).reduce((sum, d) => sum + d, 0)
}

/**
 * Pick the price to show for a card. Prefer the variant the owner chose; if
 * the source doesn't price that variant fall back to whatever it does price,
 * cheapest first, so we never overstate a card's value.
 */
export function pickPrice(card: CatalogCard, preferred: Variant, source: string): PriceQuote | null {
  const from = card.priceSource ?? source
  const preferredPrice = card.prices[preferred]
  if (preferredPrice != null && preferredPrice > 0) {
    return { price: preferredPrice, currency: 'USD', variant: preferred, source: from, updatedAt: card.priceUpdatedAt }
  }
  const alternatives = (Object.entries(card.prices) as Array<[Variant, number | undefined]>)
    .filter((entry): entry is [Variant, number] => entry[1] != null && entry[1] > 0)
    .sort((a, b) => a[1] - b[1])
  const first = alternatives[0]
  if (!first) return null
  return { price: first[1], currency: 'USD', variant: first[0], source: from, updatedAt: card.priceUpdatedAt }
}
