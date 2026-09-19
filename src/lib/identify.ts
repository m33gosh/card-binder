// Identify a card from its photo: read the bottom-left corner, then look the
// number up in the catalog. Returns candidates, best first, or none.
import { supabase } from './supabase'
import { pricing, type CatalogCard } from './pricing'
import { loadImage } from './images'
import { candidateSets, parseCardName, parseCardRef, type CardRef } from './cardNumber'
import { getSets } from './catalogSets'

/**
 * One image with the two bands worth reading: the name band across the top
 * and the bottom-left corner where the set code and number are printed.
 * Stacked into a single picture so it costs one read.
 */
export async function cornerCrop(cardBlob: Blob): Promise<Blob> {
  const img = await loadImage(cardBlob)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const top = { x: 0, y: 0, w, h: Math.round(h * 0.16) }
  const bottom = { x: 0, y: Math.round(h * 0.7), w: Math.round(w * 0.62), h: Math.round(h * 0.3) }
  // OCR reads ~2x more reliably when the text is a good size; aim for ~1400px wide
  const scale = Math.min(3, Math.max(1, 1400 / w))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round((top.h + bottom.h) * scale) + 12
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, top.x, top.y, top.w, top.h, 0, 0, Math.round(top.w * scale), Math.round(top.h * scale))
  ctx.drawImage(img, bottom.x, bottom.y, bottom.w, bottom.h, 0, Math.round(top.h * scale) + 12, Math.round(bottom.w * scale), Math.round(bottom.h * scale))
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not crop the card.'))), 'image/jpeg', 0.85),
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
  name: string | null
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
  const name = parseCardName(text)
  // exact: set + number
  let candidates = ref ? await lookupRef(ref) : []
  // otherwise the name, narrowed by the printed total when we have one
  if (candidates.length === 0 && name) {
    const byName = await pricing.search({ name })
    const total = ref?.total
    const narrowed = total ? byName.filter((c) => String(setSize(c, sets)) === total) : byName
    candidates = (narrowed.length ? narrowed : byName).slice(0, 5)
  }
  return { ref, name, text, candidates }
}

function setSize(card: CatalogCard, sets: Awaited<ReturnType<typeof getSets>>): number | undefined {
  return card.set.printedTotal ?? sets.find((s) => s.id === card.set.id)?.printedTotal
}
