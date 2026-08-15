import { describe, expect, it } from 'vitest'
import { monotoneTangents, pathExtent, smoothPath, type Point } from './chartPath'

const at = (ys: number[]): Point[] => ys.map((y, x) => ({ x, y }))

describe('monotoneTangents', () => {
  it('flattens a turning point, which is what stops the overshoot', () => {
    // Up then down: the peak must be flat, or the curve sails past it.
    expect(monotoneTangents(at([0, 10, 0]))[1]).toBe(0)
    expect(monotoneTangents(at([10, 0, 10]))[1]).toBe(0)
  })

  it('keeps a steady slope through a straight run', () => {
    expect(monotoneTangents(at([0, 1, 2, 3]))).toEqual([1, 1, 1, 1])
  })

  it('is flat throughout a flat series', () => {
    expect(monotoneTangents(at([5, 5, 5]))).toEqual([0, 0, 0])
  })

  it('limits a tangent to three times the gentler neighbouring slope', () => {
    // 0 -> 1 is gentle, 1 -> 100 is steep; the middle tangent cannot follow the
    // steep one or the curve would dive below 0 on its way up.
    const [, middle] = monotoneTangents(at([0, 1, 100]))
    expect(middle).toBeLessThanOrEqual(3)
  })

  it('handles the degenerate inputs without throwing', () => {
    expect(monotoneTangents([])).toEqual([])
    expect(monotoneTangents(at([7]))).toEqual([0])
  })
})

describe('smoothPath', () => {
  it('starts with a move and then curves', () => {
    const d = smoothPath(at([0, 5, 3]))
    expect(d.startsWith('M0 0')).toBe(true)
    expect(d).toContain('C')
  })

  it('is empty for no points, and a bare move for one', () => {
    expect(smoothPath([])).toBe('')
    expect(smoothPath(at([4]))).toBe('M0 4')
  })

  it('passes through every point it is given', () => {
    const d = smoothPath(at([0, 10, 4]))
    expect(d).toContain('1 10')
    expect(d).toContain('2 4')
  })
})

// The property this module exists for. A money line that overshoots draws a
// loss the shop never made.
describe('the curve never leaves the data', () => {
  const cases: Record<string, number[]> = {
    'a peak': [0, 10, 0],
    'a trough': [10, 0, 10],
    'a hard step': [0, 0, 100, 100],
    'a spike back to flat': [5, 5, 60, 5, 5],
    'a steady climb': [0, 1, 2, 3, 4],
    'a slow start then a jump': [0, 1, 100],
    'a fall to zero and back': [50, 0, 50],
    'noise': [3, 9, 1, 7, 2, 8],
  }

  for (const [name, values] of Object.entries(cases)) {
    it(`stays within the data for ${name}`, () => {
      const extent = pathExtent(at(values))
      // A hair of tolerance for floating point, not for real overshoot.
      expect(extent.min).toBeGreaterThanOrEqual(Math.min(...values) - 1e-9)
      expect(extent.max).toBeLessThanOrEqual(Math.max(...values) + 1e-9)
    })
  }

  // The case that motivates the whole module: a running total that touches zero
  // and recovers must not be drawn crossing it.
  it('does not cross zero for a series that only touches it', () => {
    expect(pathExtent(at([120, 0, 90])).min).toBeGreaterThanOrEqual(0)
  })
})
