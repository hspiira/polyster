import { describe, expect, it } from 'vitest'
import {
  dueDateLabel,
  needsFulfilmentDate,
  needsMeasurements,
  needsReturn,
  usualOrderType,
} from './orderTypes'

describe('needsMeasurements', () => {
  it('is true where something is made or altered to fit', () => {
    expect(needsMeasurements('tailor_made')).toBe(true)
    expect(needsMeasurements('repair')).toBe(true)
  })

  it('is false for stock going out as it is', () => {
    expect(needsMeasurements('rental')).toBe(false)
    expect(needsMeasurements('purchase')).toBe(false)
    expect(needsMeasurements('pre_order')).toBe(false)
  })
})

describe('needsReturn', () => {
  it('is true only for rentals', () => {
    expect(needsReturn('rental')).toBe(true)
    expect(needsReturn('tailor_made')).toBe(false)
  })
})

describe('needsFulfilmentDate', () => {
  it('is true only for pre-orders', () => {
    expect(needsFulfilmentDate('pre_order')).toBe(true)
    expect(needsFulfilmentDate('purchase')).toBe(false)
  })
})

describe('dueDateLabel', () => {
  it('names the date for what it is in each case', () => {
    expect(dueDateLabel('rental')).toBe('Collection date')
    expect(dueDateLabel('purchase')).toBe('Handover date')
    expect(dueDateLabel('tailor_made')).toBe('Ready on')
    expect(dueDateLabel('repair')).toBe('Ready on')
  })
})

describe('usualOrderType', () => {
  it('falls back for a shop with no orders yet', () => {
    expect(usualOrderType([])).toBe('tailor_made')
  })

  it('picks the most common', () => {
    expect(usualOrderType(['rental', 'tailor_made', 'rental', 'rental'])).toBe('rental')
  })

  // One unusual order must not change what the next one opens on.
  it('is not swayed by a single recent outlier', () => {
    expect(usualOrderType(['repair', 'tailor_made', 'tailor_made', 'tailor_made'])).toBe(
      'tailor_made',
    )
  })

  it('breaks a tie towards the more recent', () => {
    expect(usualOrderType(['rental', 'tailor_made'])).toBe('rental')
  })
})
