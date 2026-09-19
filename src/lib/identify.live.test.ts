// Replays real reads through the real identify logic against the live catalog.
// Opt in with LIVE=1 (needs network); measures how good suggestions are.
import { describe, expect, it } from 'vitest'
import fixtures from '../../test-fixtures/whole-card-reads.json'
import { identifyFromText } from './identify'

const LIVE = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.LIVE

describe.skipIf(!LIVE)('identifyFromText on real reads', () => {
  it('gets most cards right and rarely suggests a wrong one', async () => {
    let right = 0, wrong = 0, none = 0
    for (const f of fixtures) {
      const top = (await identifyFromText(f.text)).candidates[0]
      if (!top) none++
      else if (top.id === f.expect) right++
      else { wrong++; console.log(`WRONG ${f.name} -> ${top.name} (${top.id}), expected ${f.expect}`) }
    }
    console.log(`right ${right}, wrong ${wrong}, none ${none} of ${fixtures.length}`)
    expect(right).toBeGreaterThanOrEqual(18)
    expect(wrong).toBeLessThanOrEqual(4)
  }, 120000)
})
