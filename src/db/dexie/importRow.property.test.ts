import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isDeleted, newestPerCollection, toStoredRow } from './importRow'

const rxdbRow = fc.record({
  id: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  fields: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 12 }).filter((k) => !k.startsWith('_') && k !== 'id'),
    fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
    { maxKeys: 8 },
  ),
  deleted: fc.constantFrom('0', '1', true, false, 0, 1),
  lwt: fc.double({ min: 1, max: 4e12, noNaN: true }),
})

const toRaw = (r: ReturnType<typeof rxdbRow.generate> extends never ? never : {
  id: string; fields: Record<string, unknown>; deleted: unknown; lwt: number
}) => ({
  ...r.fields,
  id: r.id,
  _deleted: r.deleted,
  _attachments: {},
  _meta: { lwt: r.lwt },
  _rev: '1-abc',
})

describe('toStoredRow, over arbitrary rows', () => {
  it('never loses a field the shop owns', () => {
    fc.assert(
      fc.property(rxdbRow, (r) => {
        const row = toStoredRow(toRaw(r))
        expect(row).not.toBeNull()
        for (const [key, value] of Object.entries(r.fields)) {
          expect(row?.[key]).toEqual(value)
        }
        expect(row?.id).toBe(r.id)
      }),
      { numRuns: 500 },
    )
  })

  it('never carries one of RxDB\'s own fields through', () => {
    fc.assert(
      fc.property(rxdbRow, (r) => {
        const row = toStoredRow(toRaw(r)) as Record<string, unknown>
        for (const key of ['_deleted', '_attachments', '_meta', '_rev']) {
          expect(key in row).toBe(false)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('marks deleted_at on exactly the deleted rows', () => {
    fc.assert(
      fc.property(rxdbRow, (r) => {
        const raw = toRaw(r)
        const row = toStoredRow(raw)
        expect('deleted_at' in (row ?? {})).toBe(isDeleted(raw))
      }),
      { numRuns: 500 },
    )
  })

  it('is idempotent: importing an imported row changes nothing', () => {
    fc.assert(
      fc.property(rxdbRow, (r) => {
        const once = toStoredRow(toRaw(r))
        expect(toStoredRow(once as Record<string, unknown>)).toEqual(once)
      }),
      { numRuns: 300 },
    )
  })
})

describe('a whole shop, over arbitrary sizes', () => {
  it('imports every row exactly once', () => {
    fc.assert(
      fc.property(fc.uniqueArray(rxdbRow, { selector: (r) => r.id, maxLength: 400 }), (rows) => {
        const imported = rows.map((r) => toStoredRow(toRaw(r))).filter(Boolean)
        expect(imported).toHaveLength(rows.length)
        expect(new Set(imported.map((r) => r!.id)).size).toBe(rows.length)
      }),
      { numRuns: 60 },
    )
  })
})

describe('newestPerCollection, over arbitrary version sets', () => {
  const source = fc.record({
    collection: fc.constantFrom('clients', 'orders', 'payments', 'staff'),
    version: fc.integer({ min: 0, max: 9 }),
  })

  it('returns one source per collection, always the highest version', () => {
    fc.assert(
      fc.property(fc.array(source, { maxLength: 40 }), (raw) => {
        const sources = raw.map((s) => ({ ...s, database: `${s.collection}@${s.version}` }))
        const picked = newestPerCollection(sources)

        const names = picked.map((s) => s.collection)
        expect(new Set(names).size).toBe(names.length)

        for (const s of sources) {
          const chosen = picked.find((p) => p.collection === s.collection)
          expect(chosen!.version).toBeGreaterThanOrEqual(s.version)
        }
      }),
      { numRuns: 300 },
    )
  })
})
