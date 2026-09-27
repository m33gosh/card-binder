// Finds the main picture on a product or wiki page, so a pasted store link
// becomes a photo. Reads the page server-side (browsers can't, cross-site)
// and returns the Open Graph image, or the first large image it can find.
//
// POST { url } -> { image, title }
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function isPublicHttpUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (!/^https?:$/.test(u.protocol)) return null
  const h = u.hostname.toLowerCase()
  // no internal hosts or IP literals: this function must not become a proxy into private networks
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':')) return null
  return u
}

const attr = (tag: string, name: string) => new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag)?.[1]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: role } = await supabase.rpc('my_role')
  if (!['editor', 'admin'].includes(role)) return json({ error: 'Not allowed.' }, 403)

  let url: unknown
  try {
    ;({ url } = await req.json())
  } catch {
    return json({ error: 'Send JSON with a url field.' }, 400)
  }
  const target = typeof url === 'string' ? isPublicHttpUrl(url.trim()) : null
  if (!target) return json({ error: 'That needs to be a normal web link.' }, 400)

  let html = ''
  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; CardBinder/1.0; +https://github.com/m33gosh/card-binder)', Accept: 'text/html,image/*' }
    let res = await fetch(target, { headers, redirect: 'follow', signal: AbortSignal.timeout(12000) })
    if (res.status === 403 || res.status === 406) {
      // some shops only talk to browsers
      res = await fetch(target, { headers: { ...headers, 'User-Agent': 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }, redirect: 'follow', signal: AbortSignal.timeout(12000) })
    }
    if (!res.ok) return json({ error: `That page answered ${res.status}. Try the product's own page, or a link to the picture itself.` }, 502)
    // a link straight to a picture is fine as it is
    if ((res.headers.get('content-type') ?? '').startsWith('image/')) return json({ image: res.url || target.toString(), title: target.pathname.split('/').pop() })
    html = (await res.text()).slice(0, 1_500_000)
  } catch {
    return json({ error: 'That page took too long or could not be read.' }, 502)
  }

  // shops describe the product for search engines: the most reliable product photo
  let image: string | undefined
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]) as unknown
      const nodes = Array.isArray(data) ? data : [(data as { '@graph'?: unknown[] })['@graph'] ?? data].flat()
      for (const node of nodes as Array<Record<string, unknown>>) {
        if (node && (node['@type'] === 'Product' || (Array.isArray(node['@type']) && node['@type'].includes('Product')))) {
          const img = node.image
          const first = Array.isArray(img) ? img[0] : img
          const url = typeof first === 'string' ? first : (first as { url?: string } | undefined)?.url
          if (url) {
            image = url
            break
          }
        }
      }
      if (image) break
    } catch {
      /* not JSON */
    }
  }
  const metas = html.match(/<meta[^>]+>/gi) ?? []
  const pick = (prop: string) => metas.map((m) => (attr(m, 'property') === prop || attr(m, 'name') === prop ? attr(m, 'content') : undefined)).find(Boolean)
  // product:image and twitter:image are usually the product; og:image is often the shop's generic share picture
  image ??= pick('product:image') ?? pick('twitter:image') ?? pick('twitter:image:src') ?? pick('og:image') ?? pick('og:image:secure_url')
  if (!image) {
    // first <img> that looks like a product shot, not an icon
    for (const tag of html.match(/<img[^>]+>/gi) ?? []) {
      const src = attr(tag, 'src') ?? attr(tag, 'data-src')
      if (src && !/logo|icon|sprite|pixel|\.svg/i.test(src) && (Number(attr(tag, 'width') ?? 400) >= 200)) {
        image = src
        break
      }
    }
  }
  if (!image) return json({ error: 'No picture found on that page.' }, 404)
  const absolute = new URL(image.replace(/&amp;/g, '&'), target).toString()
  const title = /<title[^>]*>([^<]{1,200})/i.exec(html)?.[1]?.trim()
  return json({ image: absolute, title })
})
