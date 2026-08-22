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

  // 20,000 catches a generator that repeats, and it timed out under a full
  // suite run at the default 5s, so it says how long it may take.
  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 20000 }, newId))
    expect(ids.size).toBe(20000)
  }, 30000)

  it('does not sort by creation time', () => {
    const ids = Array.from({ length: 200 }, newId)
    expect([...ids].sort()).not.toEqual(ids)
  })

  it('fits the id field the schemas declare', () => {
    expect(newId().length).toBeLessThanOrEqual(36)
  })
})
