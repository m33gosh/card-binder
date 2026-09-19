#!/usr/bin/env node
// Regenerate src/lib/pricing/tcgdexSetCodes.json: the three-letter code printed
// on cards (PBL, OBF, …) for every set TCGdex knows. The runtime set list comes
// from TCGdex's GraphQL, which doesn't expose codes, so they're bundled here.
// Run it now and then (new sets appear a few times a year).
import { writeFileSync } from 'node:fs'
const sets = await (await fetch('https://api.tcgdex.net/v2/en/sets')).json()
const out = {}
let n = 0
for (const s of sets) {
  const d = await (await fetch(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(s.id)}`)).json()
  const code = d.abbreviation?.official
  if (code) out[s.id] = code
  if (++n % 40 === 0) process.stdout.write(`${n}/${sets.length}\r`)
}
writeFileSync('src/lib/pricing/tcgdexSetCodes.json', JSON.stringify(out, null, 1) + '\n')
console.log(`\n${Object.keys(out).length} of ${sets.length} sets have a code`)
