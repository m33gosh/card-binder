import { CARD_IMAGES_BUCKET, supabase } from '@/lib/supabase'
import { pickPrice, pricing, type CatalogCard } from '@/lib/pricing'
import type { CardInsert, CardRow, CardUpdate, PricePoint } from './types'

const SIGNED_URL_TTL = 60 * 60 // seconds

export async function listCards(): Promise<CardRow[]> {
  const { data, error } = await supabase.from('cards').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CardRow[]
}

export async function getCard(id: string): Promise<CardRow | null> {
  const { data, error } = await supabase.from('cards').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as CardRow | null) ?? null
}

export async function getPriceHistory(cardId: string): Promise<PricePoint[]> {
  const { data, error } = await supabase
    .from('price_history')
    .select('price,currency,source,recorded_at')
    .eq('card_id', cardId)
    .order('recorded_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as PricePoint[]
}

/** Signed URLs for a batch of storage paths, keyed by path. */
export async function signImageUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)))
  if (unique.length === 0) return {}
  const { data, error } = await supabase.storage.from(CARD_IMAGES_BUCKET).createSignedUrls(unique, SIGNED_URL_TTL)
  if (error) throw error
  const out: Record<string, string> = {}
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl
  return out
}

export async function uploadCardImage(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from(CARD_IMAGES_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  return path
}

export async function deleteCardImage(path: string): Promise<void> {
  await supabase.storage.from(CARD_IMAGES_BUCKET).remove([path])
}

export async function createCard(userId: string, input: CardInsert): Promise<CardRow> {
  const { data, error } = await supabase
    .from('cards')
    .insert({ ...input, owner_id: userId })
    .select()
    .single()
  if (error) throw error
  const row = data as CardRow
  if (row.market_price != null) await recordPrice(row)
  return row
}

export async function updateCard(id: string, patch: CardUpdate): Promise<CardRow> {
  const { data, error } = await supabase.from('cards').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as CardRow
}

export async function deleteCard(card: CardRow): Promise<void> {
  const { error } = await supabase.from('cards').delete().eq('id', card.id)
  if (error) throw error
  if (card.image_path) await deleteCardImage(card.image_path)
}

async function recordPrice(card: CardRow): Promise<void> {
  if (card.market_price == null) return
  await supabase.from('price_history').insert({
    card_id: card.id,
    price: card.market_price,
    currency: card.price_currency ?? 'USD',
    source: card.price_source ?? 'unknown',
  })
}

/** Fields to copy from a catalog match onto a card row. */
export function fieldsFromCatalog(match: CatalogCard, variant: CardRow['variant']): CardUpdate {
  const quote = pickPrice(match, variant, pricing.name)
  return {
    name: match.name,
    set_name: match.set.name,
    set_id: match.set.id,
    card_number: match.number,
    rarity: match.rarity ?? null,
    api_card_id: match.id,
    api_image_url: match.images.large,
    market_price: quote?.price ?? null,
    price_currency: quote?.currency ?? 'USD',
    price_source: quote ? quote.source : null,
    price_updated_at: quote ? new Date().toISOString() : null,
  }
}

/**
 * Re-fetch today's market price for every card linked to the catalog.
 * Sequential on purpose: kind to the free API's rate limit.
 */
export async function refreshPrices(
  cards: CardRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ updated: number; failed: number }> {
  const linked = cards.filter((c) => c.api_card_id)
  let updated = 0
  let failed = 0
  for (let i = 0; i < linked.length; i++) {
    const card = linked[i]
    try {
      const match = await pricing.getCard(card.api_card_id!)
      const quote = match ? pickPrice(match, card.variant, pricing.name) : null
      if (quote) {
        const row = await updateCard(card.id, {
          market_price: quote.price,
          price_currency: quote.currency,
          price_source: quote.source,
          price_updated_at: new Date().toISOString(),
          api_image_url: match?.images.large ?? card.api_image_url,
        })
        await recordPrice(row)
        updated++
      }
    } catch {
      failed++
    }
    onProgress?.(i + 1, linked.length)
  }
  return { updated, failed }
}

export function collectionValue(cards: CardRow[]): number {
  return cards.reduce((sum, c) => sum + (c.market_price ?? 0) * c.quantity, 0)
}
