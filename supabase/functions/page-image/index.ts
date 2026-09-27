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
    const res = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CardBinder/1.0; +https://github.com/m33gosh/card-binder)', Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return json({ error: `That page answered ${res.status}.` }, 502)
    html = (await res.text()).slice(0, 600_000)
  } catch {
    return json({ error: 'That page could not be read.' }, 502)
  }

  const metas = html.match(/<meta[^>]+>/gi) ?? []
  const pick = (prop: string) => metas.map((m) => (attr(m, 'property') === prop || attr(m, 'name') === prop ? attr(m, 'content') : undefined)).find(Boolean)
  let image = pick('og:image') ?? pick('og:image:secure_url') ?? pick('twitter:image') ?? pick('twitter:image:src')
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
  const absolute = new URL(image, target).toString()
  const title = /<title[^>]*>([^<]{1,200})/i.exec(html)?.[1]?.trim()
  return json({ image: absolute, title })
})
