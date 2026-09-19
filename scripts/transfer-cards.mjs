#!/usr/bin/env node
// Move every card (and its photo) from one account to another.
//   node scripts/transfer-cards.mjs <from-user-id> <to-user-id> [--dry-run]
// Photos are moved inside the bucket (a rename, no re-upload), then the rows
// are re-pointed. Needs SUPABASE_SERVICE_ROLE_KEY in .env.local.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const [from, to, ...flags] = process.argv.slice(2)
const dry = flags.includes('--dry-run')
if (!from || !to) { console.error('usage: node scripts/transfer-cards.mjs <from-user-id> <to-user-id> [--dry-run]'); process.exit(1) }
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: people, error: pErr } = await s.from('profiles').select('id,display_name').in('id', [from, to])
if (pErr) throw pErr
if (people.length !== 2) throw new Error('Both user ids must exist in profiles.')
const name = (id) => people.find((p) => p.id === id)?.display_name
const { data: cards, error } = await s.from('cards').select('id,name,image_path').eq('owner_id', from)
if (error) throw error
console.log(`${cards.length} cards from ${name(from)} → ${name(to)}${dry ? ' (dry run)' : ''}`)
if (dry) process.exit(0)
let moved = 0
for (const c of cards) {
  let image_path = c.image_path
  if (image_path && image_path.startsWith(from + '/')) {
    const next = to + image_path.slice(from.length)
    const { error: mErr } = await s.storage.from('card-images').move(image_path, next)
    if (mErr && !/not found/i.test(mErr.message)) throw new Error(`${c.name}: ${mErr.message}`)
    if (!mErr) { image_path = next; moved++ }
  }
  const { error: uErr } = await s.from('cards').update({ owner_id: to, image_path }).eq('id', c.id)
  if (uErr) throw uErr
}
const { count } = await s.from('cards').select('id', { count: 'exact', head: true }).eq('owner_id', to)
console.log(`done: ${cards.length} rows re-pointed, ${moved} photos moved; ${name(to)} now owns ${count} rows`)
