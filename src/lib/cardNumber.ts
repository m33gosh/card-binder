// Turn the printed collector info on a card ("PBL EN 072/084", "SVE 007",
// "SWSH176") into something we can look up. Shared by the search box (a person
// typing "72/84") and the OCR path (messy text off a photo).

export interface CardRef {
  /** collector number as printed, without leading zeros: "72", "SWSH176" */
  number: string
  /** printed set size, when the card shows N/M */
  total?: string
  /** three-letter set code printed on modern cards, when found */
  code?: string
}

// promo cards print a prefix instead of N/M; map it to the catalog's set code
const PROMO_CODES: Record<string, string> = { SVP: 'SVP', SWSH: 'SWSH', SM: 'SMP', XY: 'XYP' }

const strip = (n: string) => n.replace(/^0+(?=\d)/, '')

export function parseCardRef(text: string, knownCodes: string[] = []): CardRef | null {
  const t = text
    .toUpperCase()
    .replace(/[O]\s*\//g, '0/')
    .replace(/\/\s*[O]/g, '/0')
    // Japanese set codes like SV4a are often read as SY4A
    .replace(/\bSY(\d)/g, 'SV$1')
  // two-letter codes (HP, AR, …) collide with ordinary words; only trust 3+
  const usable = knownCodes.filter((c) => c.length >= 3).map((c) => c.toUpperCase())
  const codeRe = usable.length ? new RegExp(`\\b(${usable.map((c) => c.replace(/[-]/g, '\\-')).join('|')})\\b`) : null
  const code = codeRe?.exec(t)?.[1]

  const fraction = /(\d{1,3})\s*\/\s*(\d{2,3})/.exec(t)
  if (fraction) return { number: strip(fraction[1]), total: strip(fraction[2]), code }

  const energy = /\b(SVE|MEE)\s*EN?\s*(\d{3})\b/.exec(t)
  if (energy) return { number: strip(energy[2]), code: energy[1] }

  const promo = /\b(SWSH|SM|XY)\s?(\d{2,3})\b/.exec(t)
  if (promo) return { number: `${promo[1]}${promo[2]}`, code: PROMO_CODES[promo[1]] }

  const svPromo = /\bSVP\s*EN?\s*(\d{1,3})\b/.exec(t)
  if (svPromo) return { number: strip(svPromo[1]), code: PROMO_CODES.SVP }

  return null
}

/** True when the search box holds something like "72/84" or "72 / 084". */
export function looksLikeCardRef(input: string): boolean {
  return /^\s*\d{1,3}\s*\/\s*\d{2,3}\s*$/.test(input)
}

export interface SetInfo {
  id: string
  name: string
  ptcgoCode?: string
  printedTotal?: number
  releaseDate?: string
}

/**
 * Which sets could this card be from? A set code pins it exactly; otherwise the
 * printed total narrows it to a handful. Newest first, so ties resolve to the
 * card most likely to be in a kid's binder today.
 */
export function candidateSets(ref: CardRef, sets: SetInfo[]): SetInfo[] {
  const sorted = [...sets].sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
  if (ref.code) {
    const wanted = ref.code.toUpperCase()
    const byCode = sorted.filter((s) => s.ptcgoCode?.toUpperCase() === wanted)
    if (byCode.length) {
      const byTotal = ref.total ? byCode.filter((s) => String(s.printedTotal) === ref.total) : []
      if (byTotal.length) return byTotal
      // the code's sets don't have this many cards: the code was a misread, trust the total
      if (!ref.total) return byCode
    }
  }
  if (ref.total) return sorted.filter((s) => String(s.printedTotal) === ref.total)
  return []
}

const KIND_WORDS = /\b(BASIC|STAGE\s*[12Z]?|ITEM|TRAINER|SUPPORTER|STADIUM|POK[ÉE]MON\s+TOOL|TOOL|SPECIAL|ENERGY\s+CARD)\b/gi
// fragments of the copyright line and other things that are never a name
const NOISE = /^(pokemon|pokémon|nintendo|creatures|game|freak|illus|inc|ability|weakness|resistance|retreat|the|this|your|and|from|with|card|cards|attack|damage|effect|turn)$/i
const SUFFIX = /^(ex|EX|V|GX|VMAX|VSTAR|LV\.?X)$/

const words = (text: string) =>
  text
    .replace(KIND_WORDS, ' ')
    .replace(/[^A-Za-z0-9'’.\-&é ]/g, ' ')
    .split(/\s+/)
    .filter((w) => (/[A-Za-zé]{3,}/.test(w) || SUFFIX.test(w)) && !NOISE.test(w) && !/\d{4}/.test(w))

/**
 * Guesses at the card's name, longest first. On a Pokémon the name sits right
 * before "HP", but the reader often tacks a stray word on the front, so the
 * guesses drop words from the front. Trainers and energies have no HP: take
 * the first words after the kind label and drop words from the end.
 */
export function nameCandidates(text: string): string[] {
  const hp = /\bHP\b/i.exec(text)
  const out: string[] = []
  if (hp) {
    const picked = words(text.slice(0, hp.index).split(/\bEvolves\b/i)[0]).slice(-4)
    while (picked.length && SUFFIX.test(picked[0])) picked.shift()
    for (let i = 0; i < picked.length; i++) out.push(picked.slice(i).join(' '))
  } else {
    const picked = words(text.split(/\bEvolves\b/i)[0]).slice(0, 4)
    for (let n = picked.length; n > 0; n--) out.push(picked.slice(0, n).join(' '))
  }
  return out.filter((n) => n.length >= 3)
}

/** Best single guess at the name, for showing to a person. */
export function parseCardName(text: string): string | null {
  return nameCandidates(text)[0] ?? null
}

/** Does the text carry a Japanese set code (SV4a, S12a, SM12a, M1S…) that isn't an English one? */
export function japaneseCodeIn(text: string, japaneseCodes: string[], englishCodes: string[]): string | null {
  const t = text.toUpperCase().replace(/\bSY(\d)/g, 'SV$1')
  const en = new Set(englishCodes.map((c) => c.toUpperCase()))
  const ja = japaneseCodes.filter((c) => c.length >= 2 && !en.has(c.toUpperCase())).map((c) => c.toUpperCase())
  if (!ja.length) return null
  const re = new RegExp(`\\b(${ja.map((c) => c.replace(/[-+.]/g, '\\$&')).join('|')})\\b`)
  return re.exec(t)?.[1] ?? null
}

/** Asian-language cards print metric stats ("3.2kg", "0.3m") and 全国図鑑No.; English cards print lbs and NO. */
export function looksNonEnglish(text: string): boolean {
  return /\d\s*kg\b/i.test(text) || /\bN[O0]?\.?\s*0\d{3}\b/i.test(text)
}

/** National Pokédex number from "全国図鑑No.0013", read by OCR as "N0013" / "NO.0013" / "No. 013". */
export function dexNumberIn(text: string): number | null {
  const m = /\bN[Oo0]?\.?\s*0*(\d{1,4})\b/.exec(text.replace(/[Ｎ]/g, 'N'))
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= 1100 ? n : null
}
