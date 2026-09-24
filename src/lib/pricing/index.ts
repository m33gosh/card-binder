import { tcgdexSource } from './tcgdex'
import { tcgplayerMirror } from './tcgcsv'
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
    const twin = await tcgplayerMirror
      .findByPrintedNumber(card.number, card.set.printedTotal != null ? String(card.set.printedTotal) : undefined, card.language, card.set.id)
      .catch(() => [] as CatalogCard[])
    const withImage = twin.find((t) => t.images.large)
    return withImage ? { ...card, images: withImage.images } : card
  },

  listSets: (lang) => tcgdexSource.listSets(lang),
  findByNumber: (number, setIds, lang) => tcgdexSource.findByNumber(number, setIds, lang),
}
