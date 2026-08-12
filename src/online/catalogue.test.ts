import { describe, expect, it } from 'vitest'
import { PRODUCT_TYPES } from './catalogue'

describe('PRODUCT_TYPES', () => {
  it('matches the enum the migration enforces', () => {
    expect(PRODUCT_TYPES).toEqual(['garment', 'accessory', 'service', 'rental', 'custom'])
  })
})
