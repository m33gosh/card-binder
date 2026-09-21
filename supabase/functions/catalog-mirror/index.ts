// Proxies tcgcsv.com (a free daily mirror of TCGplayer's listings) for the
// app, because that site sends no CORS headers. Read-only, public data;
// cached here for six hours since the mirror updates once a day.
//
// POST { path: "3/groups" | "3/<groupId>/products" | "3/<groupId>/prices" }
// Category 3 is Pokémon (English), 85 is Pokémon Japan.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const TTL = 6 * 60 * 60 * 1000
const cache = new Map<string, { at: number; body: string }>()
const json = (body: string, status = 200) => new Response(body, { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json('{"error":"POST only"}', 405)
  let path: unknown
  try {
    ;({ path } = await req.json())
  } catch {
    return json('{"error":"Send JSON with a path field."}', 400)
  }
  if (typeof path !== 'string' || !/^(3|85)\/(groups|\d{1,7}\/(products|prices))$/.test(path)) return json('{"error":"Unsupported path."}', 400)
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < TTL) return json(hit.body)
  const upstream = await fetch(`https://tcgcsv.com/tcgplayer/${path}`)
  if (!upstream.ok) return json(`{"error":"Mirror returned ${upstream.status}."}`, 502)
  const body = await upstream.text()
  cache.set(path, { at: Date.now(), body })
  return json(body)
})
