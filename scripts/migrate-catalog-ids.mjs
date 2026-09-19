#!/usr/bin/env node
// Re-point cards from pokemontcg.io ids (me1-77) to TCGdex ids (me01-077),
// matching by set name + collector number, and refresh image, price and
// stats from TCGdex. Safe to re-run: it only touches rows whose id doesn't
// resolve in TCGdex yet.
//   node scripts/migrate-catalog-ids.mjs [--dry-run]
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const dry = process.argv.includes('--dry-run')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const REST = 'https://api.tcgdex.net/v2/en'
const get = async (p) => { const r = await fetch(REST + p); return r.status === 404 ? null : r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${p}`)) }
const normVariant = (k) => ({ 'reverse-holofoil': 'reverseHolofoil', '1st-edition-holofoil': '1stEditionHolofoil', '1st-edition': '1stEditionNormal' })[k] ?? k
const strip = (n) => String(n).replace(/^0+(?=\d)/, '').toUpperCase()
// "Basic Fire Energy" and "Fire Energy" are the same card
const norm = (n) => n.toLowerCase().replace(/^basic\s+/, '').replace(/[^a-z0-9]/g, '')
const damage = (d) => { const m = /\d+/.exec(d == null ? '' : String(d)); return m ? Number(m[0]) : 0 }
// pokemontcg set names that TCGdex spells differently
const NAME_ALIASES = { 'Scarlet & Violet Energies': 'Scarlet & Violet Energy', 'Scarlet & Violet Black Star Promos': 'SV Black Star Promos' }

const sets = await get('/sets')
const byName = new Map(sets.map((x) => [x.name.toLowerCase(), x]))
const setCards = new Map()
async function cardsOf(setId) { if (!setCards.has(setId)) setCards.set(setId, (await get(`/sets/${encodeURIComponent(setId)}`))?.cards ?? []); return setCards.get(setId) }

const { data: rows, error } = await s.from('cards').select('id,name,set_name,card_number,api_card_id,variant').not('api_card_id', 'is', null)
if (error) throw error
console.log(`${rows.length} matched rows${dry ? ' (dry run)' : ''}`)
let moved = 0, kept = 0, failed = 0
for (const row of rows) {
  // already a TCGdex id?
  const existing = await get(`/cards/${encodeURIComponent(row.api_card_id)}`)
  let card = existing
  if (!card) {
    const setName = NAME_ALIASES[row.set_name] ?? row.set_name
    const set = byName.get((setName ?? '').toLowerCase()) ?? sets.find((x) => x.name.toLowerCase().includes((setName ?? '').toLowerCase()))
    const hit = set ? (await cardsOf(set.id)).find((c) => strip(c.localId) === strip(row.card_number ?? '')) : null
    if (hit && norm(hit.name) !== norm(row.name)) console.log(`  ! ${row.name} → ${hit.name} (${hit.id}) name differs, skipping`)
    card = hit && norm(hit.name) === norm(row.name) ? await get(`/cards/${encodeURIComponent(hit.id)}`) : null
  }
  if (!card) { failed++; console.log(`  ? ${row.name} (${row.set_name} #${row.card_number}) not found in TCGdex`); continue }
  const tcg = card.pricing?.tcgplayer ?? {}
  const prices = Object.fromEntries(Object.entries(tcg).filter(([, v]) => v && typeof v === 'object' && v.marketPrice > 0).map(([k, v]) => [normVariant(k), v.marketPrice]))
  const pick = prices[row.variant] ? [row.variant, prices[row.variant]] : Object.entries(prices).sort((a, b) => a[1] - b[1])[0]
  const patch = {
    api_card_id: card.id,
    api_image_url: card.image ? `${card.image}/high.webp` : null,
    set_id: card.set.id,
    set_name: card.set.name,
    card_number: strip(card.localId),
    rarity: card.rarity ?? null,
    supertype: card.category === 'Pokemon' ? 'Pokémon' : card.category ?? null,
    types: card.types ?? null,
    hp: typeof card.hp === 'number' ? card.hp : null,
    attack_power: card.attacks ? card.attacks.reduce((sum, a) => sum + damage(a.damage), 0) : null,
    ...(pick ? { market_price: pick[1], variant: normVariant(pick[0]), price_currency: 'USD', price_source: 'TCGplayer via TCGdex', price_updated_at: new Date().toISOString() } : {}),
  }
  if (!dry) {
    const { error: uErr } = await s.from('cards').update(patch).eq('id', row.id)
    if (uErr) throw uErr
    if (pick) {
      // one history point per card per day is plenty
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const { data: recent } = await s.from('price_history').select('id').eq('card_id', row.id).eq('price', pick[1]).gte('recorded_at', since).limit(1)
      if (!recent?.length) await s.from('price_history').insert({ card_id: row.id, price: pick[1], currency: 'USD', source: 'TCGplayer via TCGdex' })
    }
  }
  existing ? kept++ : moved++
  process.stdout.write(`\r${moved + kept + failed}/${rows.length} ${row.name.padEnd(26)} ${row.api_card_id} → ${card.id} ${pick ? '$' + pick[1] : 'no price'}      `)
}
console.log(`\nre-pointed ${moved}, already TCGdex ${kept}, not found ${failed}`)
