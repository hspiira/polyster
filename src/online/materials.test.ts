import { describe, expect, it } from 'vitest'
import { MATERIAL_TYPES } from './materials'

describe('MATERIAL_TYPES', () => {
  it('matches the enum the migration enforces', () => {
    expect(MATERIAL_TYPES).toEqual(['fabric', 'thread', 'button', 'zipper', 'label', 'packaging', 'other'])
  })
})
