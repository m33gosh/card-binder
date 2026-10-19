// English ↔ Japanese Pokémon names, so someone can type "Arboliva" and find
// オリーヴァ in the Japanese catalog. Species names come from PokéAPI (free,
// no key); card names are the species name plus a suffix like ex or V.
const KEY = 'card-binder:janames:v1'

/** "Mega Lucario ex" → "lucario"; "Mr. Mime" → "mr-mime"; "Farfetch'd" → "farfetchd" */
export function speciesSlug(cardName: string): string {
  return cardName
    .toLowerCase()
    .replace(/\b(mega|alolan|galarian|hisuian|paldean|radiant|shining|dark|light|team rocket's|rocket's)\b/g, ' ')
    .replace(/\b(ex|v|gx|vmax|vstar|lv\.?x|tag team|break|prism star)\b/g, ' ')
    .replace(/[♀]/g, '-f')
    .replace(/[♂]/g, '-m')
    .replace(/[.'’:]/g, '')
    .replace(/[^a-z0-9\- ]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
}

function readCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

/** PokéAPI's language codes for the catalogs we use. */
const POKEAPI_LANG: Record<string, string[]> = { ja: ['ja', 'ja-Hrkt'], 'zh-tw': ['zh-Hant'], 'zh-cn': ['zh-Hans'], en: ['en'] }

async function speciesNames(slugOrDex: string | number): Promise<Array<{ name: string; language: { name: string } }> | null> {
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${encodeURIComponent(String(slugOrDex))}`)
    if (!res.ok) return null
    return ((await res.json()) as { names?: Array<{ name: string; language: { name: string } }> }).names ?? null
  } catch {
    return null
  }
}

/** The species name in another language for an English card name, or null if PokéAPI doesn't know it. */
export async function speciesNameIn(english: string, lang: string): Promise<string | null> {
  const slug = speciesSlug(english)
  if (!slug) return null
  const cache = readCache()
  const key = `${lang}:${slug}`
  if (key in cache) return cache[key] || null
  const names = await speciesNames(slug)
  const codes = POKEAPI_LANG[lang] ?? [lang]
  const found = codes.map((c) => names?.find((n) => n.language.name === c)?.name).find(Boolean) ?? null
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...cache, [key]: found ?? '' }))
  } catch {
    /* ignore */
  }
  return found
}

/** Japanese species name for an English card name. */
export const japaneseSpeciesName = (english: string) => speciesNameIn(english, 'ja')

/** Species name in a catalog language, by National Pokédex number. */
export async function speciesNameByDexIn(dex: number, lang: string): Promise<string | null> {
  const cache = readCache()
  const key = `#${lang}:${dex}`
  if (key in cache) return cache[key] || null
  const names = await speciesNames(dex)
  const codes = POKEAPI_LANG[lang] ?? [lang]
  const found = codes.map((c) => names?.find((n) => n.language.name === c)?.name).find(Boolean) ?? null
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...cache, [key]: found ?? '' }))
  } catch {
    /* ignore */
  }
  return found
}

/** Japanese species name by National Pokédex number. */
export const japaneseSpeciesNameByDex = (dex: number) => speciesNameByDexIn(dex, 'ja')

/** English species name by National Pokédex number. */
export const englishSpeciesNameByDex = (dex: number) => speciesNameByDexIn(dex, 'en')

const JA_PREFIXES: Array<[RegExp, string]> = [
  [/^メガ/, 'Mega '],
  [/^アローラ/, 'Alolan '],
  [/^ガラル/, 'Galarian '],
  [/^ヒスイ/, 'Hisuian '],
  [/^パルデア/, 'Paldean '],
  // Chinese (Traditional and Simplified)
  [/^超級/, 'Mega '],
  [/^阿羅拉|^阿罗拉/, 'Alolan '],
  [/^伽勒爾|^伽勒尔/, 'Galarian '],
  [/^洗翠/, 'Hisuian '],
  [/^帕底亞|^帕底亚/, 'Paldean '],
]

/** "メガアブソルex" + species "Absol" → "Mega Absol ex"; "超級路卡利歐ex" → "Mega Lucario ex". */
export function englishCardName(japaneseName: string, englishSpecies: string): string {
  let rest = japaneseName
  let prefix = ''
  for (const [re, en] of JA_PREFIXES) {
    if (re.test(rest)) {
      prefix = en
      rest = rest.replace(re, '')
      break
    }
  }
  const suffix = /(ex|EX|V|VMAX|VSTAR|GX|BREAK)$/.exec(rest)?.[1]
  return `${prefix}${englishSpecies}${suffix ? ' ' + suffix : ''}`.trim()
}
