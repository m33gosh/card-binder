#!/usr/bin/env node
// Fill in type / HP / attack power (and anything else the catalog knows) for
// cards that were matched before those columns existed.
//   node scripts/backfill-stats.mjs            # all binders
// Needs SUPABASE_SERVICE_ROLE_KEY in .env.local. Run migration 0005 first.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const parseDamage = (t) => { const m = /\d+/.exec(t ?? ''); return m ? Number(m[0]) : 0 }
async function fetchCard(id) {
  const u = `https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(id)}`
  for (let i = 0; i < 12; i++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(40000) }); if (r.status === 404) return null; if (r.ok) return (await r.json()).data } catch {} await new Promise((r) => setTimeout(r, 4000 + 3000 * i)) }
  throw new Error('catalog unreachable for ' + id)
}
const { data: rows, error } = await s.from('cards').select('id,name,api_card_id').not('api_card_id', 'is', null).is('supertype', null)
if (error) throw error
console.log(`${rows.length} matched cards without stats`)
const cache = new Map()
let done = 0
for (const row of rows) {
  let card = cache.get(row.api_card_id)
  if (card === undefined) { card = await fetchCard(row.api_card_id); cache.set(row.api_card_id, card) }
  if (!card) { console.log(`  ${row.name}: not in catalog any more`); continue }
  const patch = {
    supertype: card.category === 'Pokemon' ? 'Pokémon' : card.category ?? null,
    types: card.types ?? null,
    hp: typeof card.hp === 'number' ? card.hp : null,
    attack_power: card.attacks ? card.attacks.reduce((sum, a) => sum + parseDamage(a.damage), 0) : null,
  }
  const { error: uErr } = await s.from('cards').update(patch).eq('id', row.id)
  if (uErr) throw uErr
  done++
  process.stdout.write(`\r${done}/${rows.length} ${row.name.padEnd(28)} ${patch.types?.join('/') ?? patch.supertype ?? ''} hp ${patch.hp ?? '-'} atk ${patch.attack_power ?? '-'}   `)
}
console.log(`\nDone: ${done} updated.`)
