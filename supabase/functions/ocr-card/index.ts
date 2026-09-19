// Reads the text on a card corner via OCR.space, keeping the API key server-side.
//
// POST { image: "data:image/jpeg;base64,..." }  ->  { text: string }
// Only signed-in editors/admins may call it (checked against the same
// my_role() the row-security policies use), so nobody else can spend the quota.
//
// Deploy:  npx supabase functions deploy ocr-card --project-ref <ref>
// Secret:  npx supabase secrets set OCR_SPACE_API_KEY=... --project-ref <ref>
import { createClient } from 'npm:@supabase/supabase-js@2'

const MAX_BYTES = 900_000 // OCR.space free tier caps files at 1 MB
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const apiKey = Deno.env.get('OCR_SPACE_API_KEY')
  if (!apiKey) return json({ error: 'OCR is not set up on the server.' }, 503)

  // who is asking? run my_role() as the caller
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: role, error: roleError } = await supabase.rpc('my_role')
  if (roleError || !['editor', 'admin'].includes(role)) return json({ error: 'Not allowed.' }, 403)

  let image: unknown
  let language: unknown
  try {
    ;({ image, language } = await req.json())
  } catch {
    return json({ error: 'Send JSON with an image field.' }, 400)
  }
  if (typeof image !== 'string' || !image.startsWith('data:image/')) return json({ error: 'image must be a data URL.' }, 400)
  if (image.length * 0.75 > MAX_BYTES) return json({ error: 'Image too large; send just the card corner.' }, 413)

  const form = new FormData()
  form.append('base64Image', image)
  // 'jpn' reads Japanese cards (names, attacks); 'eng' is the default
  form.append('language', language === 'jpn' ? 'jpn' : 'eng')
  form.append('OCREngine', '2') // engine 2 read 68% of card numbers in testing; engine 1 managed 22%
  form.append('scale', 'true')
  form.append('isOverlayRequired', 'false')

  const upstream = await fetch('https://api.ocr.space/parse/image', { method: 'POST', headers: { apikey: apiKey }, body: form })
  if (upstream.status === 429) return json({ error: 'The text reader is busy right now. Cards can still be named by hand.' }, 429)
  if (!upstream.ok) return json({ error: `OCR service returned ${upstream.status}.` }, 502)
  const result = await upstream.json()
  if (result.IsErroredOnProcessing) return json({ error: String(result.ErrorMessage ?? 'OCR failed.') }, 502)
  const text = (result.ParsedResults ?? []).map((p: { ParsedText?: string }) => p.ParsedText ?? '').join(' ')
  return json({ text: text.replace(/\s+/g, ' ').trim() })
})
