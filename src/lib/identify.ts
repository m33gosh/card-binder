// Identify a card from its photo: read the bottom-left corner, then look the
// number up in the catalog. Returns candidates, best first, or none.
import { supabase } from './supabase'
import { pricing, tcgplayerMirror, type CatalogCard, type CatalogLang } from './pricing'
import { loadImage } from './images'
import { candidateSets, dexNumberIn, japaneseCodeIn, looksNonEnglish, nameCandidates, parseCardRef, type CardRef } from './cardNumber'
import { japaneseSpeciesNameByDex } from './pokeNames'
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

/** Ask the server to read the text on a card image. */
export async function readCornerText(corner: Blob, language: 'eng' | 'jpn' = 'eng'): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ text?: string; error?: string }>('ocr-card', {
    body: { image: await toDataUrl(corner), language },
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
  language: CatalogLang
}

/** Resolve a card reference (from OCR or typed) to catalog cards. */
export async function lookupRef(ref: CardRef, lang: CatalogLang = 'en'): Promise<CatalogCard[]> {
  const sets = await getSets(lang)
  // a set code the main catalog doesn't know means a set it hasn't added:
  // don't guess by set size there, ask the listings for that code instead
  const knownCode = ref.code ? sets.some((s) => s.ptcgoCode?.toUpperCase() === ref.code!.toUpperCase()) : false
  const candidates = ref.code && !knownCode ? [] : candidateSets(ref, sets)
  if (candidates.length > 0) {
    // one query for up to 6 sets; more than that is a guess anyway
    const cards = await pricing.findByNumber(ref.number, candidates.slice(0, 6).map((s) => s.id), lang)
    const order = new Map(candidates.map((s, i) => [s.id, i]))
    if (cards.length) return cards.sort((a, b) => (order.get(a.set.id) ?? 99) - (order.get(b.set.id) ?? 99))
  }
  // not in the main catalog (a set it hasn't added yet?): try TCGplayer's recent listings
  if (ref.total || ref.code) return tcgplayerMirror.findByPrintedNumber(ref.number, ref.total, lang, ref.code).catch(() => [])
  return []
}

export async function identifyCard(cardBlob: Blob): Promise<Identification> {
  const image = await cornerCrop(cardBlob)
  const text = await readCornerText(image)
  const result = await identifyFromText(text)
  if (result.candidates.length > 0) return result
  // nothing in the English catalog: a Japanese set code, metric stats or a
  // Pokédex number in the corner mean this is probably a Japanese card
  const [ja, en, mirrorJa] = await Promise.all([
    getSets('ja'),
    getSets('en'),
    tcgplayerMirror.listSets('ja').catch(() => [] as Awaited<ReturnType<typeof getSets>>),
  ])
  const jaCodes = [...ja.map((s) => s.id), ...mirrorJa.map((s) => s.ptcgoCode ?? '')]
  const jaCode = japaneseCodeIn(text, jaCodes, en.map((s) => s.ptcgoCode ?? ''))
  let japanese = Boolean(jaCode) || looksNonEnglish(text)
  // cards with no Pokédex line (VMAX, V, trainers) give no such hint: if the
  // printed number exists only in a recent Japanese set, that's the answer
  if (!japanese && result.ref?.total) {
    const jaHits = await tcgplayerMirror.findByPrintedNumber(result.ref.number, result.ref.total, 'ja').catch(() => [] as CatalogCard[])
    if (jaHits.length === 1) return { ...result, candidates: jaHits, name: jaHits[0].name, language: 'ja' }
    japanese = jaHits.length > 1
  }
  if (!japanese) return result
  // a second read in Japanese gets the name and attacks for confirmation
  const jaText = await readCornerText(image, 'jpn').catch(() => '')
  return identifyJapanese(text, jaText)
}

/** Japanese cards: set code + number is exact; the Japanese read confirms the name. */
export async function identifyJapanese(latinText: string, jaText: string): Promise<Identification> {
  const sets = await getSets('ja')
  const mirrorCodes = await tcgplayerMirror.listSets('ja').then((l) => l.map((s) => s.ptcgoCode).filter((c): c is string => Boolean(c))).catch(() => [] as string[])
  const ref = parseCardRef(latinText, [...sets.map((s) => s.id), ...mirrorCodes])
  const jaName = (c: CatalogCard) => jaText.includes(c.name) || c.name.includes(readJaName(jaText) ?? '\u0000')

  // 1. set code + number is exact (main catalog, then TCGplayer's recent sets)
  let candidates = ref?.code ? await lookupRef(ref, 'ja') : []
  if (candidates.length === 0 && ref?.total) candidates = await tcgplayerMirror.findByPrintedNumber(ref.number, ref.total, 'ja').catch(() => [])

  // 2. Pokédex number → species → its cards, narrowed to the collector number.
  //    Works even when the set code was missed (the "151" set mark fools the reader)
  if (candidates.length === 0) {
    const dex = dexNumberIn(latinText)
    const species = dex ? await japaneseSpeciesNameByDex(dex) : null
    if (species) {
      const prints = await pricing.search({ name: species, lang: 'ja' })
      const byNumber = ref ? prints.filter((c) => c.number.toUpperCase() === ref.number.toUpperCase()) : []
      candidates = byNumber.length ? byNumber : prints.slice(0, 5)
    }
  }

  // 3. the Japanese read alone: the card's name in kana/kanji
  if (candidates.length === 0 && jaText) {
    const name = readJaName(jaText)
    if (name) candidates = (await pricing.search({ name, lang: 'ja' })).filter((c) => c.name.includes(name) || name.includes(c.name)).slice(0, 5)
  }

  // the Japanese read confirms which of several it is
  if (candidates.length > 1 && jaText) {
    const confirmed = candidates.filter(jaName)
    if (confirmed.length) candidates = confirmed
  }
  // search results are brief; fetch the chosen card in full (prices, stats, picture, English name)
  if (candidates[0] && (Object.keys(candidates[0].prices).length === 0 || !candidates[0].images.large || !candidates[0].nameAlt)) {
    const full = await pricing.getCard(candidates[0].id, 'ja').catch(() => null)
    if (full) candidates[0] = full
  }
  // no match (new set the catalog lacks?): still hand back the Japanese name
  // so the card can be saved by name in one tap and matched later
  const name = candidates[0]?.name ?? readJaName(jaText) ?? null
  return { ref, name, text: jaText ? `${latinText}\n${jaText}` : latinText, candidates, language: 'ja' }
}

/** First run of kana/kanji of 2+ characters: on a Japanese read, that's the name. */
function readJaName(jaText: string): string | null {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]{2,}/u.exec(jaText)?.[0] ?? null
}

/** Everything after the read: pure text handling plus catalog lookups. */
export async function identifyFromText(text: string): Promise<Identification> {
  const sets = await getSets()
  const codes = sets.map((s) => s.ptcgoCode).filter((c): c is string => Boolean(c))
  const ref = parseCardRef(text, codes)
  const guesses = nameCandidates(text)
  const name = guesses[0] ?? null
  // did the reader get any real word off the card? then a match must agree with it
  const readableName = guesses.some((g) => /[A-Za-zé]{5,}/.test(g))

  // exact: set + number, but the number alone can land on the wrong card
  // (misread digit, or a set of the same size), so the name we read must agree
  let candidates = ref ? await lookupRef(ref) : []
  if (candidates.length > 0) {
    const confirmed = candidates.filter((c) => appearsInText(text, c.name))
    candidates = confirmed.length ? confirmed : readableName ? [] : candidates
  }

  // otherwise the name: try the guesses longest-first until the catalog answers,
  // then pick the print that best fits what else was read (illustrator, HP, number)
  if (candidates.length === 0 && name) {
    for (const guess of guesses.slice(0, 4)) {
      const byName = (await pricing.search({ name: guess })).filter((c) => nameFits(c.name, guess))
      if (byName.length === 0) continue
      const total = ref?.total
      const narrowed = total ? byName.filter((c) => String(setSize(c, sets)) === total) : byName
      candidates = await rankPrints(text, ref, (narrowed.length ? narrowed : byName).slice(0, 6))
      break
    }
  }
  return { ref, name, text, candidates, language: 'en' }
}

const readHp = (text: string) => /\bHP\s*(\d{2,3})\b/i.exec(text)?.[1]
const readIllustrator = (text: string) => /\bIllus\.?\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\-]+(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'\-]+){0,2})/.exec(text)?.[1]

/**
 * Several prints share a name. Fetch each candidate's details and score how
 * well it fits the other things read off the card. Ties stay newest-first.
 */
async function rankPrints(text: string, ref: CardRef | null, prints: CatalogCard[]): Promise<CatalogCard[]> {
  if (prints.length <= 1) return prints
  const hp = readHp(text)
  const illus = readIllustrator(text)
  const t = ' ' + simplify(text) + ' '
  const detailed = await Promise.all(prints.map(async (p) => (await pricing.getCard(p.id).catch(() => null)) ?? p))
  const scored = detailed.map((card, i) => {
    let score = 0
    if (ref && card.number.toUpperCase() === ref.number.toUpperCase()) score += 3
    if (hp && card.hp != null && String(card.hp) === hp) score += 1
    if (illus && card.illustrator) {
      const surname = simplify(card.illustrator).split(' ').filter((w) => w.length >= 3).at(-1)
      if (surname && t.includes(' ' + surname + ' ')) score += 2
    }
    // attack names tell same-name prints apart (Chaos Rising has four Deoxys)
    for (const attack of card.attackNames ?? []) {
      const key = simplify(attack).split(' ').filter((w) => w.length >= 4)[0]
      if (key && textHasWord(text, key)) score += 2
    }
    return { card, score, i }
  })
  scored.sort((a, b) => b.score - a.score || a.i - b.i)
  return scored.map((s) => s.card)
}

const simplify = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Edit distance, for forgiving a misread letter or two in a name. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/** "philippe" ≈ "phillippe": one slip per ~5 letters, only for longer words. */
export function closeEnough(a: string, b: string): boolean {
  if (a === b) return true
  const n = Math.max(a.length, b.length)
  if (n < 6) return false
  return editDistance(a, b) <= (n >= 10 ? 2 : 1)
}

const textHasWord = (text: string, word: string) => simplify(text).split(' ').some((w) => closeEnough(w, word))

/**
 * Does a catalog card's name genuinely match a guess read off a photo?
 * A one-word guess must be the whole name ("Umbreon"), never a fragment
 * ("Sharp" is not Sharpedo). Longer guesses must appear as whole words.
 */
export function nameFits(cardName: string, guess: string): boolean {
  const a = simplify(cardName)
  const g = simplify(guess)
  if (!g) return false
  if (!g.includes(' ')) return closeEnough(a, g) || (closeEnough(a.split(' ')[0], g) && g.length >= 5 && /^(ex|v|gx|vmax|vstar)$/.test(a.split(' ')[1] ?? ''))
  if ((' ' + a + ' ').includes(' ' + g + ' ')) return true
  // multi-word guess with a slip in one word
  const gw = g.split(' ')
  const aw = a.split(' ')
  for (let i = 0; i + gw.length <= aw.length; i++) if (gw.every((w, k) => closeEnough(w, aw[i + k]))) return true
  return false
}

/** Is this card's name somewhere in the text read off the photo? */
export function appearsInText(text: string, cardName: string): boolean {
  const t = ' ' + simplify(text) + ' '
  const words = simplify(cardName).split(' ').filter((w) => w.length >= 4 && !/^(mega|alolan|galarian|hisuian|paldean|basic|energy)$/.test(w))
  const key = words[0] ?? simplify(cardName).split(' ')[0]
  return key.length >= 3 && (t.includes(' ' + key + ' ') || textHasWord(text, key))
}

function setSize(card: CatalogCard, sets: Awaited<ReturnType<typeof getSets>>): number | undefined {
  return card.set.printedTotal ?? sets.find((s) => s.id === card.set.id)?.printedTotal
}
