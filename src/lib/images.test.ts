import { describe, expect, it } from 'vitest'
import { gridCells, type GridSpec } from './images'

describe('gridCells', () => {
  const spec: GridSpec = { bounds: { x: 0, y: 0, w: 1, h: 1 }, cols: 3, rows: 3, inset: 0 }
  it('produces rows × cols cells in reading order', () => {
    const cells = gridCells(spec)
    expect(cells).toHaveLength(9)
    expect(cells[0]).toEqual({ x: 0, y: 0, w: 1 / 3, h: 1 / 3 })
    expect(cells[1].x).toBeCloseTo(1 / 3)
    expect(cells[3].y).toBeCloseTo(1 / 3)
  })
  it('applies the inset symmetrically', () => {
    const [cell] = gridCells({ ...spec, inset: 0.1 })
    expect(cell.x).toBeCloseTo(1 / 30)
    expect(cell.w).toBeCloseTo(1 / 3 - 2 / 30)
  })
})
