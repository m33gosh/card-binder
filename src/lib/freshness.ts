// GitHub Pages lets browsers keep the page for ten minutes, and a home-screen
// web app on iPad can hold on to an old copy longer. On start, compare the
// running build with what's published; if newer, refetch past the cache and
// reload once.
import { BUILD_VERSION } from '../version'

export async function reloadIfStale(): Promise<void> {
  if (!/^https?:/.test(location.protocol)) return
  try {
    if (sessionStorage.getItem('card-binder:reloaded') === BUILD_VERSION) return
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const { version } = (await res.json()) as { version?: string }
    if (!version || version === BUILD_VERSION) return
    try {
      sessionStorage.setItem('card-binder:reloaded', version)
    } catch {
      /* ignore */
    }
    // pull a fresh copy of the page into the cache, then reload onto it
    await fetch(location.pathname + location.search, { cache: 'reload' }).catch(() => undefined)
    location.reload()
  } catch {
    /* offline or blocked: keep running */
  }
}
