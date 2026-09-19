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

// codes printed on the card that differ from what the catalog calls the set
const PROMO_CODES: Record<string, string> = { SVP: 'PR-SV', SWSH: 'PR-SW', SM: 'PR-SM' }

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
