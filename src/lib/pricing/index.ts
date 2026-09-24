import { tcgdexSource } from './tcgdex'
import { codeAliases, tcgplayerMirror } from './tcgcsv'
import { japaneseSpeciesName } from '../pokeNames'
import type { CatalogCard, PricingSource } from './types'

export * from './types'
export { tcgplayerMirror }

/**
 * The main catalog (TCGdex) answers first. The TCGplayer mirror fills in what
 * it lacks: brand-new sets, and any card whose id starts with "tcgp-".
 */
export const pricing: PricingSource = {
  name: tcgdexSource.name,

  async search(query) {
    const main = await tcgdexSource.search(query)
    if (main.length) return main
    return tcgplayerMirror.search(query.name, query.lang ?? 'en').catch(() => [] as CatalogCard[])
  },

  async getCard(id, lang) {
    if (id.startsWith('tcgp-')) return tcgplayerMirror.getCard(id)
    const card = await tcgdexSource.getCard(id, lang)
    if (!card || card.images.large) return card
    // the main catalog has no picture yet (newest Japanese sets): borrow TCGplayer's
    for (const code of codeAliases(card.set.id)) {
      const twin = await tcgplayerMirror
        .findByPrintedNumber(card.number, card.set.printedTotal != null ? String(card.set.printedTotal) : undefined, card.language, code)
        .catch(() => [] as CatalogCard[])
      for (const t of twin) {
        // the two catalogs can number promos differently: the names must agree
        if (t.images.large && (await sameCard(card, t))) return { ...card, images: t.images }
      }
    }
    return card
  },
}

/** Do a main-catalog card and a TCGplayer listing describe the same card? */
async function sameCard(card: CatalogCard, listing: CatalogCard): Promise<boolean> {
  const a = card.name.toLowerCase()
  const b = listing.name.toLowerCase()
  if (a === b || a.includes(b) || b.includes(a)) return true
  // energies: "基本炎エネルギー" vs "Basic Fire Energy"
  if (/energy/.test(b) && /エネルギー|energy/.test(a)) return true
  // Japanese name vs English listing: compare the species
  if (card.language === 'ja') {
    const ja = await japaneseSpeciesName(listing.name).catch(() => null)
    if (ja && card.name.includes(ja)) return true
  }
  return false

  listSets: (lang) => tcgdexSource.listSets(lang),
  findByNumber: (number, setIds, lang) => tcgdexSource.findByNumber(number, setIds, lang),
