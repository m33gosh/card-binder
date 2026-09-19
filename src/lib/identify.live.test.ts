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

describe.skipIf(!LIVE)('identifyJapanese on a real read', () => {
  it('finds a Japanese card from its set code, number and Japanese name', async () => {
    const latin = '221t HP 150 90- :14m jic : 48.2kg * 1 < ath*l 150 56 R x 2 Illus. Hideki Ishikawa G sy4a 205/190 S tE tr h ©2023 Pokémon/Nintendo/Cr'
    const ja = '2進化 オリーヴァ オリーニョから進化 M 150 全国図鑑NO.0930 オリープポケモン ソーラービーム 150 55点 x2 Hllus.'
    const { identifyJapanese } = await import('./identify')
    const result = await identifyJapanese(latin, ja)
    expect(result.language).toBe('ja')
    expect(result.candidates[0]?.id).toBe('SV4a-205')
    expect(result.candidates[0]?.name).toBe('オリーヴァ')
    expect(result.candidates[0]?.prices.normal ?? 0).toBeGreaterThan(0)
  }, 60000)
})

describe.skipIf(!LIVE)('identifyJapanese from a Pokédex number', () => {
  it('finds the Japanese 151 Weedle when the set code was missed', async () => {
    const latin = 'Si HP. 50 N0013 EER 95: 03m ##: 3.2kg 10 20 Sh F x 2 tr 15illus. nisimono G 151 C 013/151 C 2025 Pokemon/Nintendo/Creatures/GAME FREAK. weaki illus. Pl'
    const { identifyJapanese } = await import('./identify')
    const result = await identifyJapanese(latin, '')
    expect(result.candidates[0]?.id).toBe('SV2a-013')
    expect(result.candidates[0]?.name).toBe('ビードル')
  }, 60000)
})
