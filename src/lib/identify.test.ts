import { describe, expect, it } from 'vitest'
import { nameFits } from './identify'

describe('nameFits', () => {
  it('needs a whole-name match for a single word', () => {
    expect(nameFits('Umbreon', 'Umbreon')).toBe(true)
    expect(nameFits('Sharpedo', 'Sharp')).toBe(false)
    expect(nameFits('Mega Lucario ex', 'Mega')).toBe(false)
    expect(nameFits('Houndoom ex', 'Houndoom')).toBe(true)
  })
  it('needs whole words for longer guesses', () => {
    expect(nameFits('Mega Delphox ex', 'Mega Delphox ex')).toBe(true)
    expect(nameFits('Nest Ball', 'Nest Ball')).toBe(true)
    expect(nameFits('Rapid Strike Urshifu V', 'Strike Urshifu')).toBe(true)
    expect(nameFits('Sharpedo ex', 'Sharp Fang')).toBe(false)
  })
})
