import { describe, expect, it } from 'vitest'
import { periodDays, periodLabel, periodRange } from './period'

const NOW = '2026-08-13'

describe('periodRange', () => {
  it('counts today as the first of the days, not an extra one', () => {
    expect(periodRange('7', NOW)).toEqual({ from: '2026-08-07', to: NOW })
    expect(periodDays(periodRange('7', NOW))).toBe(7)
    expect(periodDays(periodRange('30', NOW))).toBe(30)
    expect(periodDays(periodRange('90', NOW))).toBe(90)
  })

  it('takes the dates given when customised', () => {
    expect(periodRange('custom', NOW, { from: '2026-07-01', to: '2026-07-31' })).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    })
  })

  it('swaps a backwards custom range rather than reporting on nothing', () => {
    expect(periodRange('custom', NOW, { from: '2026-07-31', to: '2026-07-01' })).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    })
  })

  it('falls back to today when a custom date is missing', () => {
    expect(periodRange('custom', NOW, {})).toEqual({ from: NOW, to: NOW })
    expect(periodRange('custom', NOW, { from: '2026-08-01' })).toEqual({
      from: '2026-08-01',
      to: NOW,
    })
  })
})

describe('periodLabel', () => {
  it('names a preset in the terms a sentence needs', () => {
    expect(periodLabel('30', periodRange('30', NOW))).toBe('last 30 days')
  })

  it('spells out a custom range, and a single day as one date', () => {
    expect(periodLabel('custom', { from: '2026-08-01', to: '2026-08-13' })).toBe(
      '1 Aug 2026 to 13 Aug 2026',
    )
    expect(periodLabel('custom', { from: NOW, to: NOW })).toBe('13 Aug 2026')
  })
})
