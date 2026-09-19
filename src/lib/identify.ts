// Identify a card from its photo: read the bottom-left corner, then look the
// number up in the catalog. Returns candidates, best first, or none.
import { supabase } from './supabase'
import { pricing, type CatalogCard } from './pricing'
import { loadImage } from './images'
import { candidateSets, parseCardRef, type CardRef } from './cardNumber'
import { getSets } from './catalogSets'

/** The strip along the bottom of a card where the set code and number are printed. */
export async function cornerCrop(cardBlob: Blob): Promise<Blob> {
  const img = await loadImage(cardBlob)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const region = { x: 0, y: Math.round(h * 0.8), w: Math.round(w * 0.62), h: Math.round(h * 0.2) }
  // upscale small crops a little; OCR reads 2x more reliably than it reads tiny text
  const scale = region.w < 900 ? 2 : 1
  const canvas = document.createElement('canvas')
  canvas.width = region.w * scale
  canvas.height = region.h * scale
  canvas.getContext('2d')!.drawImage(img, region.x, region.y, region.w, region.h, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not crop the corner.'))), 'image/jpeg', 0.85),
  )
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('Could not read image.'))
    r.readAsDataURL(blob)
  })
}

/** Ask the server to read the text on a corner crop. */
export async function readCornerText(corner: Blob): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>('ocr-card', {
    body: { image: await toDataUrl(corner) },
  })
  if (error) throw new Error(error.message || 'Text reading failed.')
  if (data?.error) throw new Error(data.error)
  return data?.text ?? ''
}

export interface Identification {
  ref: CardRef | null
  text: string
  candidates: CatalogCard[]
}

/** Resolve a card reference (from OCR or typed) to catalog cards. */
export async function lookupRef(ref: CardRef): Promise<CatalogCard[]> {
  const sets = await getSets()
  const candidates = candidateSets(ref, sets)
  if (candidates.length === 0) return []
  // one query for up to 6 sets; more than that is a guess anyway
  const cards = await pricing.findByNumber(ref.number, candidates.slice(0, 6).map((s) => s.id))
  const order = new Map(candidates.map((s, i) => [s.id, i]))
  return cards.sort((a, b) => (order.get(a.set.id) ?? 99) - (order.get(b.set.id) ?? 99))
}

export async function identifyCard(cardBlob: Blob): Promise<Identification> {
  const sets = await getSets()
  const codes = sets.map((s) => s.ptcgoCode).filter((c): c is string => Boolean(c))
  const text = await readCornerText(await cornerCrop(cardBlob))
  const ref = parseCardRef(text, codes)
  if (!ref) return { ref: null, text, candidates: [] }
  return { ref, text, candidates: await lookupRef(ref) }
}
