import { describe, expect, it } from 'vitest'
import { GARMENT_UNIT_STATUSES } from './garmentUnits'

describe('GARMENT_UNIT_STATUSES', () => {
  it('matches the enum the migration enforces', () => {
    expect(GARMENT_UNIT_STATUSES).toEqual([
      'produced',
      'available',
      'reserved',
      'sold',
      'returned',
      'repair',
      'retired',
      'lost',
      'damaged',
    ])
  })
})
