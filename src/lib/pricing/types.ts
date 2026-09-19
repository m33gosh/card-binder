// A pricing source turns "which card is this" into "what's it worth today".
// Swap the implementation in ./index.ts if pokemontcg.io ever stops fitting.

export type Variant =
  | 'normal'
  | 'holofoil'
  | 'reverseHolofoil'
  | '1stEditionHolofoil'
  | '1stEditionNormal'
  | 'unlimited'

export const VARIANT_LABELS: Record<Variant, string> = {
  normal: 'Regular',
  holofoil: 'Holo',
  reverseHolofoil: 'Reverse holo',
  '1stEditionHolofoil': '1st edition holo',
  '1stEditionNormal': '1st edition',
  unlimited: 'Unlimited',
}

export interface CatalogCard {
  id: string
  name: string
  number: string
  rarity?: string
  set: { id: string; name: string; series?: string; printedTotal?: number; releaseDate?: string }
  images: { small: string; large: string }
  supertype?: 'Pokémon' | 'Trainer' | 'Energy' | string
  /** energy types, e.g. ["Fire"]; Pokémon only */
  types?: string[]
  hp?: number
  illustrator?: string
  /** printed damage of each attack, already parsed ("30+" → 30) */
  attackDamage?: number[]
  /** market price per variant, in USD, when the source knows it */
  prices: Partial<Record<Variant, number>>
  priceUpdatedAt?: string
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
  search(query: { name: string; setId?: string; number?: string; page?: number }): Promise<CatalogCard[]>
  getCard(id: string): Promise<CatalogCard | null>
  listSets(): Promise<CatalogSet[]>
  /** cards with this collector number in any of the given sets */
  findByNumber(number: string, setIds: string[]): Promise<CatalogCard[]>
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
  const preferredPrice = card.prices[preferred]
  if (preferredPrice != null && preferredPrice > 0) {
    return { price: preferredPrice, currency: 'USD', variant: preferred, source, updatedAt: card.priceUpdatedAt }
  }
  const alternatives = (Object.entries(card.prices) as Array<[Variant, number | undefined]>)
    .filter((entry): entry is [Variant, number] => entry[1] != null && entry[1] > 0)
    .sort((a, b) => a[1] - b[1])
  const first = alternatives[0]
  if (!first) return null
  return { price: first[1], currency: 'USD', variant: first[0], source, updatedAt: card.priceUpdatedAt }
}
