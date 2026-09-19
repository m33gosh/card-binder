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

/** Japanese species name for an English card name, or null if PokéAPI doesn't know it. */
export async function japaneseSpeciesName(english: string): Promise<string | null> {
  const slug = speciesSlug(english)
  if (!slug) return null
  const cache = readCache()
  if (slug in cache) return cache[slug] || null
  let ja: string | null = null
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${encodeURIComponent(slug)}`)
    if (res.ok) {
      const body = (await res.json()) as { names?: Array<{ name: string; language: { name: string } }> }
      ja = body.names?.find((n) => n.language.name === 'ja')?.name ?? body.names?.find((n) => n.language.name === 'ja-Hrkt')?.name ?? null
    }
  } catch {
    return null
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...cache, [slug]: ja ?? '' }))
  } catch {
    /* ignore */
  }
  return ja
}

/** Japanese species name by National Pokédex number. */
export async function japaneseSpeciesNameByDex(dex: number): Promise<string | null> {
  const cache = readCache()
  const key = `#${dex}`
  if (key in cache) return cache[key] || null
  let ja: string | null = null
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${dex}`)
    if (res.ok) {
      const body = (await res.json()) as { names?: Array<{ name: string; language: { name: string } }> }
      ja = body.names?.find((n) => n.language.name === 'ja')?.name ?? body.names?.find((n) => n.language.name === 'ja-Hrkt')?.name ?? null
    }
  } catch {
    return null
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...cache, [key]: ja ?? '' }))
  } catch {
    /* ignore */
  }
  return ja
}
