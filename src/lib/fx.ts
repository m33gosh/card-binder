// Euro → dollar, for Japanese cards priced by Cardmarket. Free daily rate
// from the European Central Bank via frankfurter.dev; cached for a day.
const KEY = 'card-binder:eurusd:v1'
let memo: Promise<number | null> | null = null

export function eurToUsdRate(): Promise<number | null> {
  if (memo) return memo
  memo = (async () => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const { at, rate } = JSON.parse(raw) as { at: number; rate: number }
        if (Date.now() - at < 24 * 3600 * 1000 && rate > 0) return rate
      }
    } catch {
      /* no storage */
    }
    try {
      const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD')
      const body = (await res.json()) as { rates?: { USD?: number } }
      const rate = body.rates?.USD
      if (!rate) return null
      try {
        localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rate }))
      } catch {
        /* ignore */
      }
      return rate
    } catch {
      return null
    }
  })()
  memo.catch(() => (memo = null))
  return memo
}
