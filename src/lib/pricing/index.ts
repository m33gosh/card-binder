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
    if (main.length) return withListingPictures(main)
    return tcgplayerMirror.search(query.name, query.lang ?? 'en').catch(() => [] as CatalogCard[])
  },

  async getCard(id, lang) {
    if (id.startsWith('tcgp-')) return tcgplayerMirror.getCard(id)
    let card = await tcgdexSource.getCard(id, lang)
    if (!card) return null
    // Japanese cards: the listings name the set in English ("Mega Brave", not "メガブレイブ")
    if (card.language === 'ja' && /[^\x00-\x7F]/.test(card.set.name)) {
      const english = await englishSetName(card.set.id).catch(() => null)
      if (english) card = { ...card, set: { ...card.set, name: english } }
    }
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
        // the two catalogs can number promos differently: the names must agree,
        // except that within a proper set (code matched, not a promo set) a
        // trainer or energy with the same number is the same card
        const sameSetNonPokemon = Boolean(code) && !/promo/i.test(t.set.name) && card.supertype !== 'Pokémon' && t.supertype === card.supertype
        if (!sameSetNonPokemon && !(await sameCard(card, t))) continue
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

/**
 * Search results from the main catalog lack pictures for its newest Japanese
 * sets. Borrow them from the listings, one lookup per set, matched by number.
 */
async function withListingPictures(cards: CatalogCard[]): Promise<CatalogCard[]> {
  const missing = cards.filter((c) => !c.images.small && c.language === 'ja')
  if (missing.length === 0) return cards
  const bySet = new Map<string, CatalogCard[]>()
  for (const c of missing) bySet.set(c.set.id, [...(bySet.get(c.set.id) ?? []), c])
  const found = new Map<string, CatalogCard['images']>()
  await Promise.all(
    [...bySet.entries()].slice(0, 4).map(async ([setId, group]) => {
      for (const code of codeAliases(setId)) {
        for (const c of group) {
          const twin = await tcgplayerMirror.findByPrintedNumber(c.number, undefined, 'ja', code).catch(() => [] as CatalogCard[])
          const t = twin.find((x) => x.images.large)
          if (t && !/promo/i.test(t.set.name)) found.set(c.id, t.images)
        }
        if (found.size) break
      }
    }),
  )
  return cards.map((c) => (found.has(c.id) ? { ...c, images: found.get(c.id)! } : c))
}

/** The English name of a Japanese set, from the TCGplayer listing with the same code. */
export async function englishSetName(setId: string): Promise<string | null> {
  const groups = await tcgplayerMirror.listSets('ja')
  for (const code of codeAliases(setId)) {
    const g = groups.find((x) => x.ptcgoCode?.toUpperCase() === code.toUpperCase())
    if (g) return g.name.replace(/^[A-Za-z0-9.-]{1,8}:\s*/, '').replace(/^[A-Za-z0-9-]{2,6}\s+(?=Promo)/i, '')
  }
  return null
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
