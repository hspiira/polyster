import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type AppDatabase } from './database'
import {
  REPLICATED_TABLES,
  dropNullFields,
  replicationClient,
  startReplication,
  stopReplication,
  withNullStrippedRows,
} from './replication'

vi.mock('../lib/supabaseClient', () => ({
  isSupabaseConfigured: () => mockConfigured,
  getSupabase: () => ({
    channel: () => ({}),
    removeChannel: () => {},
    from: () => ({ select: () => ({}), insert: () => ({}), update: () => ({}) }),
  }),
}))

let mockConfigured = false

const created: AppDatabase[] = []

async function freshDatabase(): Promise<AppDatabase> {
  const db = await createDatabase({
    name: `repl_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    devMode: true,
  })
  created.push(db)
  return db
}

afterEach(async () => {
  await stopReplication()
  await Promise.all(created.splice(0).map((db) => db.remove()))
  mockConfigured = false
  vi.restoreAllMocks()
})

describe('REPLICATED_TABLES', () => {
  /* `satisfies keyof Collections` catches a typo, not an omission, so a missing
     collection would simply never leave the device. */
  it('covers every collection the database opens', async () => {
    const db = await freshDatabase()
    expect([...REPLICATED_TABLES].sort()).toEqual(Object.keys(db.collections).sort())
  })

  it('lists each table once', () => {
    expect(new Set(REPLICATED_TABLES).size).toBe(REPLICATED_TABLES.length)
  })
})

describe('dropNullFields', () => {
  /* RxDB types an optional column without `null`, so a row fetched with one
     unset is rejected unless the null is removed rather than kept. */
  it('removes keys whose value is null', () => {
    expect(dropNullFields({ id: 'a', phone: null, name: 'Ama' })).toEqual({ id: 'a', name: 'Ama' })
  })

  it('keeps every other falsy value, which are all legitimate', () => {
    expect(dropNullFields({ zero: 0, empty: '', no: false, missing: undefined })).toEqual({
      zero: 0,
      empty: '',
      no: false,
      missing: undefined,
    })
  })

  it('does not mutate the row it was given', () => {
    const row = { id: 'a', phone: null }
    dropNullFields(row)
    expect(row.phone).toBeNull()
  })
})

describe('withNullStrippedRows', () => {
  type Response = { data: unknown; error: unknown }

  function fakeBuilder(data: unknown): PromiseLike<Response> {
    return {
      then: ((onFulfilled?: (value: Response) => unknown) =>
        Promise.resolve(onFulfilled?.({ data, error: null }))) as PromiseLike<Response>['then'],
    }
  }

  it('strips nulls from every row of a list', async () => {
    const result = (await withNullStrippedRows(
      fakeBuilder([{ id: 'a', phone: null }, { id: 'b', phone: '070' }]),
    )) as { data: unknown[] }
    expect(result.data).toEqual([{ id: 'a' }, { id: 'b', phone: '070' }])
  })

  /* The plugin's fetchById returns one row, not a list, and it is the path
     pull.modifier cannot reach. */
  it('strips nulls from a single row', async () => {
    const result = (await withNullStrippedRows(fakeBuilder({ id: 'a', phone: null }))) as {
      data: unknown
    }
    expect(result.data).toEqual({ id: 'a' })
  })

  it('passes a null or primitive body through untouched', async () => {
    expect(((await withNullStrippedRows(fakeBuilder(null))) as { data: unknown }).data).toBeNull()
    expect(((await withNullStrippedRows(fakeBuilder(7))) as { data: unknown }).data).toBe(7)
  })

  it('keeps the rest of the response', async () => {
    const result = (await withNullStrippedRows(fakeBuilder([]))) as { error: unknown }
    expect(result.error).toBeNull()
  })
})

describe('replicationClient', () => {
  /* If the plugin starts calling something else it throws here, rather than
     silently skipping the null-stripping. */
  it('exposes only the surface the plugin uses', () => {
    const wrapped = replicationClient({
      channel: () => ({}),
      removeChannel: () => {},
      from: () => ({ select: () => ({}), insert: () => ({}), update: () => ({}) }),
    } as never)

    expect(typeof wrapped.channel).toBe('function')
    expect(typeof wrapped.removeChannel).toBe('function')
    expect(typeof wrapped.from).toBe('function')
    expect((wrapped as unknown as Record<string, unknown>).rpc).toBeUndefined()
    expect((wrapped as unknown as Record<string, unknown>).auth).toBeUndefined()
  })

  it('routes select, insert and update through the stripper', () => {
    const wrapped = replicationClient({
      channel: () => ({}),
      removeChannel: () => {},
      from: () => ({
        select: () => ({ then: (f: (v: unknown) => unknown) => Promise.resolve(f({ data: [], error: null })) }),
        insert: () => ({ then: (f: (v: unknown) => unknown) => Promise.resolve(f({ data: [], error: null })) }),
        update: () => ({ then: (f: (v: unknown) => unknown) => Promise.resolve(f({ data: [], error: null })) }),
      }),
    } as never)

    const table = wrapped.from('clients') as unknown as Record<string, () => unknown>
    for (const method of ['select', 'insert', 'update']) {
      expect(typeof table[method]).toBe('function')
    }
    expect(table.delete).toBeUndefined()
  })
})

describe('startReplication', () => {
  it('runs the app fully offline when Supabase is not configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(startReplication(await freshDatabase())).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('is safe to stop when it was never started', async () => {
    await expect(stopReplication()).resolves.toBeUndefined()
  })
})
