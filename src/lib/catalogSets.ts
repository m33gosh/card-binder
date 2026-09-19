import { pricing, type CatalogLang, type CatalogSet } from './pricing'

const TTL = 24 * 60 * 60 * 1000
const memo: Partial<Record<CatalogLang, Promise<CatalogSet[]>>> = {}

/** The set list changes a few times a year; cache it for a day, per language. */
export function getSets(lang: CatalogLang = 'en'): Promise<CatalogSet[]> {
  const key = `card-binder:sets:${lang}:v2`
  if (memo[lang]) return memo[lang]!
  const p = (async () => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const { at, sets } = JSON.parse(raw) as { at: number; sets: CatalogSet[] }
        if (Date.now() - at < TTL && sets.length) return sets
      }
    } catch {
      /* storage unavailable; fetch instead */
    }
    const sets = await pricing.listSets(lang)
    try {
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), sets }))
    } catch {
      /* ignore */
    }
    return sets
  })()
  memo[lang] = p
  p.catch(() => delete memo[lang])
  return p
}
