import { describe, expect, it } from 'vitest'
import {
  isDeleted,
  newestPerCollection,
  parseSource,
  toStoredRow,
  type RxdbSource,
} from './importRow'

const DB = 'tailor_tracker'

describe('parseSource', () => {
  it('reads the collection and version out of the name', () => {
    expect(parseSource('rxdb-dexie-tailor_tracker--3--orders', DB)).toEqual({
      database: 'rxdb-dexie-tailor_tracker--3--orders',
      collection: 'orders',
      version: 3,
    })
  })

  it('keeps a collection whose name contains an underscore', () => {
    expect(parseSource('rxdb-dexie-tailor_tracker--2--order_stage_history', DB)?.collection)
      .toBe('order_stage_history')
  })

  it('refuses the internal database', () => {
    expect(parseSource('rxdb-dexie-tailor_tracker--0--_rxdb_internal', DB)).toBeNull()
  })

  it('refuses anything that is not one of ours', () => {
    expect(parseSource('polyster', DB)).toBeNull()
    expect(parseSource('rxdb-dexie-other_app--1--clients', DB)).toBeNull()
    expect(parseSource('rxdb-dexie-tailor_tracker--x--clients', DB)).toBeNull()
    expect(parseSource('rxdb-dexie-tailor_tracker--1--', DB)).toBeNull()
  })
})

describe('newestPerCollection', () => {
  const at = (collection: string, version: number): RxdbSource => ({
    database: `d${version}`, collection, version,
  })

  it('takes the highest version of each collection', () => {
    const picked = newestPerCollection([at('clients', 0), at('clients', 1), at('orders', 3)])
    expect(picked.map((s) => `${s.collection}@${s.version}`)).toEqual(['clients@1', 'orders@3'])
  })

  it('is order-independent', () => {
    const a = newestPerCollection([at('clients', 1), at('clients', 0)])
    const b = newestPerCollection([at('clients', 0), at('clients', 1)])
    expect(a).toEqual(b)
  })

  it('handles nothing at all', () => {
    expect(newestPerCollection([])).toEqual([])
  })
})

describe('isDeleted', () => {
  it('reads the string form RxDB actually writes', () => {
    expect(isDeleted({ _deleted: '1' })).toBe(true)
    expect(isDeleted({ _deleted: '0' })).toBe(false)
  })

  it('reads a boolean or numeric form too', () => {
    expect(isDeleted({ _deleted: true })).toBe(true)
    expect(isDeleted({ _deleted: false })).toBe(false)
    expect(isDeleted({ _deleted: 1 })).toBe(true)
    expect(isDeleted({ _deleted: 0 })).toBe(false)
  })

  it('treats a missing flag as alive', () => {
    expect(isDeleted({})).toBe(false)
  })
})

describe('toStoredRow', () => {
  const raw = {
    id: 'c1',
    shop_id: 's1',
    name: 'Mrs. Okello',
    phone: '+256700000123',
    created_at: '2026-08-21T10:00:49.282Z',
    updated_at: '2026-08-21T10:00:49.282Z',
    _deleted: '0',
    _attachments: {},
    _meta: { lwt: 1787306449282.01 },
    _rev: '1-yciukqxrnt',
  }

  it('keeps every field the shop owns', () => {
    expect(toStoredRow(raw)).toEqual({
      id: 'c1',
      shop_id: 's1',
      name: 'Mrs. Okello',
      phone: '+256700000123',
      created_at: '2026-08-21T10:00:49.282Z',
      updated_at: '2026-08-21T10:00:49.282Z',
    })
  })

  it('drops every one of RxDB\'s own fields', () => {
    const row = toStoredRow(raw) as Record<string, unknown>
    for (const key of ['_deleted', '_attachments', '_meta', '_rev']) {
      expect(row).not.toHaveProperty(key)
    }
  })

  it('turns a soft delete into a timestamp from the last write', () => {
    const row = toStoredRow({ ...raw, _deleted: '1' })
    expect(row?.deleted_at).toBe(new Date(1787306449282.01).toISOString())
  })

  it('leaves a live row with no deleted_at at all', () => {
    expect(toStoredRow(raw)).not.toHaveProperty('deleted_at')
  })

  it('still dates a deleted row whose metadata is missing', () => {
    const row = toStoredRow({ id: 'c1', _deleted: '1' })
    expect(Number.isNaN(Date.parse(row?.deleted_at ?? ''))).toBe(false)
  })

  it('refuses a row with no usable id', () => {
    expect(toStoredRow({ name: 'no id' })).toBeNull()
    expect(toStoredRow({ id: '', name: 'blank' })).toBeNull()
    expect(toStoredRow({ id: 7 })).toBeNull()
  })

  it('keeps an object-valued field whole', () => {
    const row = toStoredRow({ id: 'u1', measurements: { chest: 40, waist: '34' } })
    expect(row?.measurements).toEqual({ chest: 40, waist: '34' })
  })
})
