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

  /* Ids are minted on a device that may be offline for days, so uniqueness
     cannot depend on a server handing them out. */
  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 20000 }, newId))
    expect(ids.size).toBe(20000)
  })

  /* A uuid v4 leaks nothing, but a v1 or a ULID leaks creation time. A shop's
     ids travel in urls and messages, so this one should not either. */
  it('does not sort by creation time', () => {
    const ids = Array.from({ length: 200 }, newId)
    expect([...ids].sort()).not.toEqual(ids)
  })

  /* The schema still accepts 36, because rows written before the switch carry
     uuids and both have to keep validating. */
  it('fits the id field the schemas declare', () => {
    expect(newId().length).toBeLessThanOrEqual(36)
  })
})
