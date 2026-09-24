#!/usr/bin/env node
// Fill name_alt (English name) and missing pictures for saved Japanese cards.
//   node scripts/backfill-names.mjs
// Needs SUPABASE_SERVICE_ROLE_KEY in .env.local. Run migration 0007 first.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
if (existsSync('.env.local')) for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const PREFIXES = [[/^メガ/, 'Mega '], [/^アローラ/, 'Alolan '], [/^ガラル/, 'Galarian '], [/^ヒスイ/, 'Hisuian '], [/^パルデア/, 'Paldean ']]
const englishCardName = (ja, species) => { let rest = ja, prefix = ''; for (const [re, en] of PREFIXES) if (re.test(rest)) { prefix = en; rest = rest.replace(re, ''); break } const suf = /(ex|EX|V|VMAX|VSTAR|GX|BREAK)$/.exec(rest)?.[1]; return `${prefix}${species}${suf ? ' ' + suf : ''}`.trim() }
const { data: rows, error } = await s.from('cards').select('id,name,api_card_id,language,name_alt').eq('language', 'ja').is('name_alt', null).not('api_card_id', 'is', null)
if (error) throw error
console.log(`${rows.length} Japanese cards without an English name`)
let done = 0
for (const r of rows) {
  if (r.api_card_id.startsWith('tcgp-')) continue // listing names are already English
  const card = await (await fetch(`https://api.tcgdex.net/v2/ja/cards/${encodeURIComponent(r.api_card_id)}`)).json().catch(() => null)
  const dex = card?.dexId?.[0]
  if (!dex) {
    // no Pokédex number (trainers, some Pokémon): the TCGplayer listing for the same set code + number is in English
    const setId = r.api_card_id.slice(0, r.api_card_id.lastIndexOf('-'))
    const num = r.api_card_id.slice(r.api_card_id.lastIndexOf('-') + 1).replace(/^0+(?=\d)/, '')
    const groups = await (await fetch('https://tcgcsv.com/tcgplayer/85/groups', { headers: { 'User-Agent': 'CardBinder/1.0' } })).json().then((b) => b.results)
    const g = groups.find((x) => /^([A-Za-z0-9.-]{1,8}):\s/.exec(x.name)?.[1]?.toUpperCase() === setId.toUpperCase())
    const products = g ? await (await fetch(`https://tcgcsv.com/tcgplayer/85/${g.groupId}/products`, { headers: { 'User-Agent': 'CardBinder/1.0' } })).json().then((b) => b.results) : []
    const p = products.find((x) => x.extendedData?.some((e) => e.name === 'Number' && e.value.split('/')[0].replace(/^0+(?=\d)/, '') === num))
    if (!p) { console.log(`  no English name found for ${r.name} (${r.api_card_id})`); continue }
    const name_alt = p.name.replace(/\s+-\s+[A-Za-z]*\d{1,3}\/\d{1,3}.*$/, '').trim()
    const { error: uErr } = await s.from('cards').update({ name_alt }).eq('id', r.id)
    if (uErr) throw uErr
    done++; console.log(`  ${r.name} → ${name_alt} (from ${g.name})`)
    continue
  }
  const species = await (await fetch(`https://pokeapi.co/api/v2/pokemon-species/${dex}`)).json().then((b) => b.names?.find((n) => n.language.name === 'en')?.name).catch(() => null)
  if (!species) { console.log(`  no English species for ${r.name}`); continue }
  const name_alt = englishCardName(r.name, species)
  const { error: uErr } = await s.from('cards').update({ name_alt }).eq('id', r.id)
  if (uErr) throw uErr
  done++; console.log(`  ${r.name} → ${name_alt}`)
}
console.log(`done: ${done} named`)
