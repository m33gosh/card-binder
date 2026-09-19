#!/usr/bin/env node
// Bulk-load cards into the binder from a manifest, with a photo for each.
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/bulk-import.mjs manifest.json photos-dir [--dry-run]
//
// The manifest is a JSON array of { name, id (catalog id or null), image (file
// name inside photos-dir), variant?, condition?, set?, number?, rarity?,
// prices? {variant: market}, officialImage? } — the shape scripts/verify
// produces. Identical catalog ids are merged into one row with a quantity.
//
// Needs the project's service-role key (Supabase → Project Settings → API).
// That key bypasses row security, so it never goes in the app or the repo:
// keep it in .env.local (gitignored) or pass it inline for the one run.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

function loadEnv() {
  if (!existsSync('.env.local')) return
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const [manifestPath, photosDir, ...flags] = process.argv.slice(2)
const dryRun = flags.includes('--dry-run')
const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!manifestPath || !photosDir) {
  console.error('usage: node scripts/bulk-import.mjs manifest.json photos-dir [--dry-run]')
  process.exit(1)
}
if (!url || (!key && !dryRun)) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local or the environment).')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

// merge identical catalog cards into one row with a quantity
const merged = new Map()
for (const item of manifest) {
  const k = item.id ?? `name:${item.name}:${item.image}`
  const row = merged.get(k)
  if (row) row.quantity += 1
  else merged.set(k, { ...item, quantity: 1 })
}
const rows = [...merged.values()]

const normVariant = (k) => ({ 'reverse-holofoil': 'reverseHolofoil', '1st-edition-holofoil': '1stEditionHolofoil', '1st-edition': '1stEditionNormal' })[k] ?? k
function pickPrice(prices = {}, variant = 'normal') {
  if (prices[variant] > 0) return { price: prices[variant], variant }
  const alt = Object.entries(prices).filter(([, v]) => v > 0).sort((a, b) => a[1] - b[1])[0]
  return alt ? { price: alt[1], variant: alt[0] } : null
}

console.log(`${manifest.length} cards in manifest → ${rows.length} rows${dryRun ? ' (dry run)' : ''}`)
const total = rows.reduce((s, r) => s + (pickPrice(r.prices, r.variant)?.price ?? 0) * r.quantity, 0)
console.log(`estimated value: $${total.toFixed(2)}`)
if (dryRun) {
  for (const r of rows) console.log(` ×${r.quantity} ${r.name} [${r.id ?? 'unmatched'}] ${pickPrice(r.prices, r.variant)?.price ?? '-'}`)
  process.exit(0)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const { data: admin, error: adminErr } = await supabase.from('profiles').select('id,email').eq('role', 'admin').order('created_at').limit(1).single()
if (adminErr || !admin) throw new Error('No admin profile found. Sign in to the app once first.')
console.log(`owner: ${admin.email}`)

const tmp = path.join(os.tmpdir(), 'card-binder-import')
execFileSync('mkdir', ['-p', tmp])
let done = 0
for (const r of rows) {
  let image_path = null
  if (r.image) {
    const src = path.join(photosDir, r.image)
    const jpg = path.join(tmp, path.basename(r.image, path.extname(r.image)) + '.jpg')
    // same normalisation the app does in the browser: longest edge 1600, JPEG
    execFileSync('magick', [src, '-auto-orient', '-resize', '1600x1600>', '-quality', '86', jpg])
    image_path = `${admin.id}/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from('card-images').upload(image_path, readFileSync(jpg), { contentType: 'image/jpeg' })
    if (error) throw error
  }
  const quote = pickPrice(r.prices, r.variant ?? 'normal')
  const { data: card, error } = await supabase
    .from('cards')
    .insert({
      owner_id: admin.id,
      name: r.catalogName ?? r.name,
      set_name: r.set ?? null,
      set_id: r.id ? r.id.split('-')[0] : null,
      card_number: r.number ?? null,
      rarity: r.rarity ?? null,
      api_card_id: r.id ?? null,
      api_image_url: r.officialImage ?? null,
      image_path,
      variant: quote?.variant ?? r.variant ?? 'normal',
      condition: r.condition ?? 'near_mint',
      quantity: r.quantity,
      market_price: quote?.price ?? null,
      price_currency: 'USD',
      price_source: quote ? 'TCGplayer via pokemontcg.io' : null,
      price_updated_at: quote ? new Date().toISOString() : null,
      notes: r.note && !r.id ? r.note : null,
    })
    .select('id')
    .single()
  if (error) throw error
  if (quote) await supabase.from('price_history').insert({ card_id: card.id, price: quote.price, currency: 'USD', source: 'TCGplayer via pokemontcg.io' })
  done++
  process.stdout.write(`\r${done}/${rows.length} ${r.name.padEnd(30)}`)
}
console.log(`\nDone. ${done} rows added.`)
