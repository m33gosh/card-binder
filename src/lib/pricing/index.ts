import { tcgdexSource } from './tcgdex'
import { codeAliases, tcgplayerMirror } from './tcgcsv'
import { englishCardName, englishSpeciesNameByDex, japaneseSpeciesName } from '../pokeNames'
import type { CatalogCard, PricingSource } from './types'

export * from './types'
export { tcgplayerMirror }

/**
 * The main catalog (TCGdex) answers first. The TCGplayer mirror fills in what
 * it lacks: brand-new sets, any card whose id starts with "tcgp-", and
 * pictures for cards the main catalog hasn't photographed yet.
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
    let card = await tcgdexSource.getCard(id, lang)
    if (!card) return null
    // Japanese cards: work out the English name from the Pokédex number
    if (card.language === 'ja' && !card.nameAlt && card.dexIds?.[0]) {
      const species = await englishSpeciesNameByDex(card.dexIds[0]).catch(() => null)
      if (species) card = { ...card, nameAlt: englishCardName(card.name, species) }
    }
    if (card.images.large && (card.language !== 'ja' || card.nameAlt)) return card
    // no picture yet, or still no English name: the matching TCGplayer listing has both
    const total = card.set.printedTotal != null ? String(card.set.printedTotal) : undefined
    const attempts: Array<string | undefined> = [...codeAliases(card.set.id), undefined]
    for (const code of attempts) {
      const twin = await tcgplayerMirror.findByPrintedNumber(card.number, total, card.language, code).catch(() => [] as CatalogCard[])
      for (const t of twin) {
        // the two catalogs can number promos differently: the names must agree
        if (!(await sameCard(card, t))) continue
        return {
          ...card,
          images: card.images.large ? card.images : t.images,
          nameAlt: card.nameAlt ?? (card.language === 'ja' && t.name !== card.name ? t.name : undefined),
        }
      }
    }
    return card
  },

  listSets: (lang) => tcgdexSource.listSets(lang),
  findByNumber: (number, setIds, lang) => tcgdexSource.findByNumber(number, setIds, lang),
}

/** Do a main-catalog card and a TCGplayer listing describe the same card? */
export async function sameCard(card: CatalogCard, listing: CatalogCard): Promise<boolean> {
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
}
