// Identify a card from its photo: read the bottom-left corner, then look the
// number up in the catalog. Returns candidates, best first, or none.
import { supabase } from './supabase'
import { pricing, type CatalogCard } from './pricing'
import { loadImage } from './images'
import { candidateSets, parseCardName, parseCardRef, type CardRef } from './cardNumber'
import { getSets } from './catalogSets'

/**
 * The whole card, shrunk to a size the reader handles well. Reading the whole
 * card (rather than just the corner) means a loose crop still works: 28 of 30
 * test cards were identified this way versus 23 from corner bands.
 */
export async function cornerCrop(cardBlob: Blob): Promise<Blob> {
  const img = await loadImage(cardBlob)
  const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare the card image.'))), 'image/jpeg', 0.85),
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
