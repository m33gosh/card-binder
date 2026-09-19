import { describe, expect, it } from 'vitest'
import { appearsInText, closeEnough, nameFits } from './identify'

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

describe('appearsInText', () => {
  it('finds the distinctive word of the name in the read text', () => {
    expect(appearsInText('STAGE 1 Houndoom Evolves from Houndour HP 130 Daring Strike', 'Houndoom')).toBe(true)
    expect(appearsInText('BASIC Mega Lucario ex HP 340', 'Mega Lucario ex')).toBe(true)
    expect(appearsInText('Item Antique Armor Fossil HP 60', 'Antique Armor Fossil')).toBe(true)
  })
  it('rejects a card whose name was not read', () => {
    expect(appearsInText('STAGE 1 Houndoom HP 130 Daring Strike', 'Emolga')).toBe(false)
    expect(appearsInText('BASIC Mega Lucario ex HP 340', 'Mega Delphox ex')).toBe(false)
  })
})

describe('closeEnough', () => {
  it('forgives a misread letter in longer words only', () => {
    expect(closeEnough('philippe', 'phillippe')).toBe(true)
    expect(closeEnough('houndoom', 'houndour')).toBe(false)
    expect(closeEnough('mew', 'mow')).toBe(false)
  })
  it('lets a misread name still count', () => {
    expect(appearsInText('Supporter Phillippe Draw 3 cards', 'Philippe')).toBe(true)
    expect(nameFits('Philippe', 'Phillippe')).toBe(true)
    expect(nameFits('Air Balloon', 'Phillippe')).toBe(false)
  })
})
