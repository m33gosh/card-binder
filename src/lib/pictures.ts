// Pictures for things without a catalog: the Squishmallows fan wiki (free,
// browser-callable) for that brand, and any store page via the page-image
// function, which reads the page's main picture server-side.
import { supabase } from './supabase'

export interface PictureHit {
  title: string
  thumb: string
  full: string
}

const WIKI = 'https://squishmallowsquad.fandom.com/api.php'

/** Strip the cache-buster; the plain URL is what loads reliably. */
const clean = (u: string) => u.replace(/\?cb=.*$/, '')

export async function searchSquishmallowWiki(query: string): Promise<PictureHit[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const u = new URL(WIKI)
  u.search = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: q,
    gsrlimit: '8',
    prop: 'pageimages',
    piprop: 'thumbnail|original',
    pithumbsize: '400',
    format: 'json',
    origin: '*',
  }).toString()
  const res = await fetch(u)
  if (!res.ok) throw new Error('The picture search is not answering right now.')
  const body = (await res.json()) as { query?: { pages?: Record<string, { title: string; index?: number; thumbnail?: { source: string }; original?: { source: string } }> } }
  return Object.values(body.query?.pages ?? {})
    .filter((p) => p.thumbnail?.source)
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
    .map((p) => ({ title: p.title, thumb: clean(p.thumbnail!.source), full: clean(p.original?.source ?? p.thumbnail!.source) }))
}

/** The main picture on a store or product page, from a pasted link. */
export async function pictureFromPage(url: string): Promise<PictureHit> {
  const { data, error } = await supabase.functions.invoke<{ image?: string; title?: string; error?: string }>('page-image', { body: { url } })
  if (error) throw new Error(await reasonFrom(error))
  if (!data?.image) throw new Error(data?.error ?? 'No picture found on that page.')
  return { title: data.title ?? url, thumb: data.image, full: data.image }
}

/** The function explains failures in its JSON body; surface that instead of "non-2xx". */
async function reasonFrom(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: string }
      if (body?.error) return body.error
    } catch {
      /* not JSON */
    }
  }
  return error instanceof Error ? error.message : 'Could not get a picture from that link.'
}
