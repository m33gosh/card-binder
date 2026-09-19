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
  const t = text.toUpperCase().replace(/[O]\s*\//g, '0/').replace(/\/\s*[O]/g, '/0')
  const codeRe = knownCodes.length ? new RegExp(`\\b(${knownCodes.map((c) => c.replace(/[-]/g, '\\-')).join('|')})\\b`) : null
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
    const byCode = sorted.filter((s) => s.ptcgoCode === ref.code)
    if (byCode.length) {
      const byTotal = ref.total ? byCode.filter((s) => String(s.printedTotal) === ref.total) : []
      return byTotal.length ? byTotal : byCode
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
 * The card's name from text read off the card. On a Pokémon the name sits
 * right before "HP", so take the few words before the first HP; otherwise
 * (trainers, energies) the first real words after the kind label.
 */
export function parseCardName(text: string): string | null {
  const hp = /\bHP\b/i.exec(text)
  let picked: string[]
  if (hp) {
    const before = text.slice(0, hp.index).split(/\bEvolves\b/i)[0]
    picked = words(before).slice(-4)
    // a name doesn't start with a suffix; drop leading fragments like "ex" or "V"
    while (picked.length && SUFFIX.test(picked[0])) picked.shift()
  } else {
    picked = words(text.split(/\bEvolves\b/i)[0]).slice(0, 4)
  }
  const name = picked.join(' ').trim()
  return name.length >= 3 ? name : null
}
