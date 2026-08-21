import { describe, expect, it } from 'vitest'
import { isCuid } from '@paralleldrive/cuid2'
import { newId } from './ids'

describe('newId', () => {
  it('makes a cuid2', () => {
    expect(isCuid(newId())).toBe(true)
  })

  it('is shorter than the uuid it replaces, and url-safe', () => {
    const id = newId()
    expect(id).toHaveLength(24)
    expect(id).toMatch(/^[a-z0-9]+$/)
  })

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 20000 }, newId))
    expect(ids.size).toBe(20000)
  })

  it('does not sort by creation time', () => {
    const ids = Array.from({ length: 200 }, newId)
    expect([...ids].sort()).not.toEqual(ids)
  })

  it('fits the id field the schemas declare', () => {
    expect(newId().length).toBeLessThanOrEqual(36)
  })
})
