import { describe, expect, it } from 'vitest'
import { englishCardName, speciesSlug } from './pokeNames'

describe('speciesSlug', () => {
  it('reduces card names to the species PokéAPI knows', () => {
    expect(speciesSlug('Mega Lucario ex')).toBe('lucario')
    expect(speciesSlug('Arboliva')).toBe('arboliva')
    expect(speciesSlug('Mr. Mime')).toBe('mr-mime')
    expect(speciesSlug("Farfetch'd")).toBe('farfetchd')
    expect(speciesSlug('Galarian Darmanitan V')).toBe('darmanitan')
    expect(speciesSlug('Rapid Strike Urshifu V')).toBe('rapid-strike-urshifu')
  })
})

describe('englishCardName', () => {
  it('rebuilds the English card name from the species', () => {
    expect(englishCardName('メガアブソルex', 'Absol')).toBe('Mega Absol ex')
    expect(englishCardName('フシギソウ', 'Ivysaur')).toBe('Ivysaur')
    expect(englishCardName('ミュウVMAX', 'Mew')).toBe('Mew VMAX')
    expect(englishCardName('ガラルヤドンV', 'Slowpoke')).toBe('Galarian Slowpoke V')
  })
})
