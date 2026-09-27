import { CARD_IMAGES_BUCKET, supabase } from '@/lib/supabase'
import { deleteCardImage, signImageUrls, uploadCardImage } from '@/features/cards/api'
import type { SquishInput, SquishRow } from './types'

export { signImageUrls, uploadCardImage as uploadSquishImage, deleteCardImage as deleteSquishImage, CARD_IMAGES_BUCKET }

export async function listSquishes(): Promise<SquishRow[]> {
  const { data, error } = await supabase.from('squishes').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SquishRow[]
}

export async function getSquish(id: string): Promise<SquishRow | null> {
  const { data, error } = await supabase.from('squishes').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as SquishRow | null) ?? null
}

export async function createSquish(userId: string, input: SquishInput): Promise<SquishRow> {
  const { data, error } = await supabase.from('squishes').insert({ ...input, owner_id: userId }).select().single()
  if (error) throw error
  return data as SquishRow
}

export async function updateSquish(id: string, patch: Partial<SquishInput>): Promise<SquishRow> {
  const { data, error } = await supabase.from('squishes').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as SquishRow
}

export async function deleteSquish(row: SquishRow): Promise<void> {
  const { error } = await supabase.from('squishes').delete().eq('id', row.id)
  if (error) throw error
  if (row.image_path) await deleteCardImage(row.image_path)
}

/** What the collection is worth: entered values, falling back to what was paid. */
export function squishValue(rows: SquishRow[]): number {
  return rows.filter((r) => !r.wishlist).reduce((sum, r) => sum + (r.value ?? r.price_paid ?? 0), 0)
}
