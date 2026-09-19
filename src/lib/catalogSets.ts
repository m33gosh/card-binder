import { pricing, type CatalogSet } from './pricing'

const KEY = 'card-binder:sets:v1'
const TTL = 24 * 60 * 60 * 1000
let memo: Promise<CatalogSet[]> | null = null

/** The set list changes a few times a year; cache it for a day. */
export function getSets(): Promise<CatalogSet[]> {
  if (memo) return memo
  memo = (async () => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const { at, sets } = JSON.parse(raw) as { at: number; sets: CatalogSet[] }
        if (Date.now() - at < TTL && sets.length) return sets
      }
    } catch {
      /* storage unavailable; fetch instead */
    }
    const sets = await pricing.listSets()
    try {
      localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), sets }))
    } catch {
      /* ignore */
    }
    return sets
  })()
  memo.catch(() => (memo = null))
  return memo
}
