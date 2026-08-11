import { describe, expect, it } from 'vitest'
import { MOVEMENT_TYPES } from './inventory'

describe('MOVEMENT_TYPES', () => {
  it('matches the enum the migration enforces', () => {
    expect(MOVEMENT_TYPES).toEqual([
      'purchase',
      'production',
      'sale',
      'order_reservation',
      'order_fulfilment',
      'return',
      'damage',
      'loss',
      'adjustment',
      'sample',
      'repair',
    ])
  })
})
