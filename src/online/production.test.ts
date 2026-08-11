import { describe, expect, it } from 'vitest'
import { BATCH_STATUSES, COST_TYPES, summarizeBatchCosts } from './production'

describe('BATCH_STATUSES / COST_TYPES', () => {
  it('match the enums the migration enforces', () => {
    expect(BATCH_STATUSES).toEqual([
      'planned',
      'materials_ready',
      'in_production',
      'quality_control',
      'completed',
      'cancelled',
    ])
    expect(COST_TYPES).toEqual([
      'materials',
      'labour',
      'transport',
      'packaging',
      'labels',
      'quality_control',
      'other',
    ])
  })
})

describe('summarizeBatchCosts', () => {
  it('sums costs and divides by usable units', () => {
    const summary = summarizeBatchCosts(
      [{ amount_minor: 1_850_000 }, { amount_minor: 900_000 }, { amount_minor: 120_000 }],
      50,
    )
    expect(summary.totalMinor).toBe(2_870_000)
    expect(summary.costPerUnitMinor).toBe(57_400)
  })

  it('returns null cost per unit rather than dividing by zero', () => {
    const summary = summarizeBatchCosts([{ amount_minor: 500_000 }], 0)
    expect(summary.costPerUnitMinor).toBeNull()
  })
})
