import { describe, expect, it } from 'vitest'
import { candidateSets, looksLikeCardRef, nameCandidates, parseCardName, parseCardRef, type SetInfo } from './cardNumber'

const codes = ['PBL', 'CRI', 'WHT', 'OBF', 'SVE']

describe('parseCardRef', () => {
  it('reads a modern corner', () => {
    expect(parseCardRef('Illus. AYUMI ODASHIMA J PBL EN 072/084 ©2026', codes)).toEqual({ number: '72', total: '84', code: 'PBL' })
  })
  it('copes with OCR turning zeros into the letter O', () => {
    expect(parseCardRef('CRI EN O30/086', codes)).toEqual({ number: '30', total: '86', code: 'CRI' })
  })
  it('reads energy and promo formats', () => {
    expect(parseCardRef('SVE EN 007 ©2023', codes)).toEqual({ number: '7', code: 'SVE' })
    expect(parseCardRef('weakness x2 SWSH176 ©2021')).toEqual({ number: 'SWSH176', code: 'SWSH' })
    expect(parseCardRef('G SVP EN 103')).toEqual({ number: '103', code: 'SVP' })
  })
  it('gives up on noise', () => {
    expect(parseCardRef('Basic Energy Basic Energy')).toBeNull()
  })
  it('accepts what a person types', () => {
    expect(parseCardRef('72/84')).toEqual({ number: '72', total: '84', code: undefined })
    expect(looksLikeCardRef(' 72 / 084 ')).toBe(true)
    expect(looksLikeCardRef('pikachu')).toBe(false)
  })
})

describe('candidateSets', () => {
  const sets: SetInfo[] = [
    { id: 'me5', name: 'Pitch Black', ptcgoCode: 'PBL', printedTotal: 84, releaseDate: '2026/07/17' },
    { id: 'me4', name: 'Chaos Rising', ptcgoCode: 'CRI', printedTotal: 86, releaseDate: '2026/05/22' },
    { id: 'rsv10pt5', name: 'White Flare', ptcgoCode: 'WHT', printedTotal: 86, releaseDate: '2025/07/18' },
    { id: 'sv3', name: 'Obsidian Flames', ptcgoCode: 'OBF', printedTotal: 197, releaseDate: '2023/08/11' },
  ]
  it('uses the set code when present', () => {
    expect(candidateSets({ number: '72', total: '84', code: 'PBL' }, sets).map((s) => s.id)).toEqual(['me5'])
  })
  it('falls back to the printed total, newest first', () => {
    expect(candidateSets({ number: '30', total: '86' }, sets).map((s) => s.id)).toEqual(['me4', 'rsv10pt5'])
  })
  it('returns nothing without a code or total', () => {
    expect(candidateSets({ number: '7' }, sets)).toEqual([])
  })
})

describe('parseCardName', () => {
  it('pulls the name out of the top band', () => {
    expect(parseCardName('STAGE 1 Houndoom Evolves from Houndour HP 130')).toBe('Houndoom')
    expect(parseCardName('BASIC Mega Lucario ex HP 340 ~ weakness')).toBe('Mega Lucario ex')
    expect(parseCardName('Item TRAINER Antique Armor Fossil HP 60')).toBe('Antique Armor Fossil')
  })
  it('offers shorter guesses when a stray word precedes the name', () => {
    const guesses = nameCandidates('26 Pol /Nintendo /Creatures/GAME FREAK STAGEZ Mega Delphox ex HP 350 Trick Portal')
    expect(guesses).toContain('Mega Delphox ex')
    expect(guesses.indexOf('Mega Delphox ex')).toBeLessThan(guesses.indexOf('Delphox ex'))
  })
  it('handles trainers without HP by trimming from the end', () => {
    const guesses = nameCandidates('Item TRAINER Nest Ball Search your deck for a Basic Pokémon')
    expect(guesses[0].startsWith('Nest Ball')).toBe(true)
    expect(guesses).toContain('Nest Ball')
  })
  it('ignores noise-only text', () => {
    expect(parseCardName('~ 7 || ..')).toBeNull()
  })
})
