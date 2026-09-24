import type { Variant } from '@/lib/pricing'

export type Condition = 'mint' | 'near_mint' | 'lightly_played' | 'moderately_played' | 'heavily_played' | 'damaged'

export const CONDITION_LABELS: Record<Condition, string> = {
  mint: 'Mint',
  near_mint: 'Near mint',
  lightly_played: 'Lightly played',
  moderately_played: 'Moderately played',
  heavily_played: 'Heavily played',
  damaged: 'Damaged',
}

export interface CardRow {
  id: string
  owner_id: string
  name: string
  /** English name of a Japanese card */
  name_alt: string | null
  set_name: string | null
  set_id: string | null
  card_number: string | null
  rarity: string | null
  api_card_id: string | null
  api_image_url: string | null
  image_path: string | null
  variant: Variant
  condition: Condition
  quantity: number
  market_price: number | null
  price_currency: string | null
  price_source: string | null
  price_updated_at: string | null
  notes: string | null
  supertype: string | null
  types: string[] | null
  hp: number | null
  attack_power: number | null
  /** 'en' or 'ja': which catalog the card and its number belong to */
  language: string
  created_at: string
  updated_at: string
}

export type CardInsert = Omit<CardRow, 'id' | 'created_at' | 'updated_at' | 'owner_id'>
export type CardUpdate = Partial<CardInsert>

export interface PricePoint {
  price: number
  currency: string
  source: string
  recorded_at: string
}

/** What to call a card: the English name when we know it, else the printed one. */
export function cardTitle(card: Pick<CardRow, 'name' | 'name_alt' | 'language'>): string {
  return card.language === 'ja' && card.name_alt ? card.name_alt : card.name
}

/** The other name, shown small under the title: the printed Japanese name. */
export function cardSubtitle(card: Pick<CardRow, 'name' | 'name_alt' | 'language'>): string | null {
  return card.language === 'ja' && card.name_alt ? card.name : null
}
