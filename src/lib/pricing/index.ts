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
    return tcgdexSource.getCard(id, lang)
  },

  listSets: (lang) => tcgdexSource.listSets(lang),
  findByNumber: (number, setIds, lang) => tcgdexSource.findByNumber(number, setIds, lang),
}
