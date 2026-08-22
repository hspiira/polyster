import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type PolysterDatabase } from './database'
import { importDone, runImport } from './import'

const opened: PolysterDatabase[] = []
let counter = 0

function fresh(): PolysterDatabase {
  const db = createDatabase(`import_${++counter}`)
  opened.push(db)
  return db
}

/** Writes a database in RxDB's on-disk shape: a `docs` store, `_deleted` a string. */
function plant(name: string, rows: Record<string, unknown>[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('docs', { keyPath: 'id' })
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('docs', 'readwrite')
      for (const row of rows) tx.objectStore('docs').put(row)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
  })
}

function names(): Promise<string[]> {
  return indexedDB.databases().then((all) => all.map((d) => d.name ?? '').filter(Boolean))
}

const META = { lwt: 1755000000000.01 }

function client(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    shop_id: 'shop-old',
    name: `Client ${id}`,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    _deleted: '0',
    _rev: '1-a',
    _meta: META,
    _attachments: {},
    ...extra,
  }
}

beforeEach(() => localStorage.clear())

afterEach(async () => {
  localStorage.clear()
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
  for (const name of await names()) {
    if (name.startsWith('rxdb-dexie-')) await indexedDB.deleteDatabase(name)
  }
})

describe('runImport', () => {
  it('brings rows across and reports them', async () => {
    await plant('rxdb-dexie-tailor_tracker--1--clients', [client('c1'), client('c2')])
    const db = fresh()

    const report = await runImport(db)

    expect(report.written).toBe(2)
    expect(await db.clients.count()).toBe(2)
  })

  /* The importer ran on every launch, re-opening every RxDB database forever,
     including for someone who never had RxDB. */
  it('does no work at all on a second run', async () => {
    await plant('rxdb-dexie-tailor_tracker--1--clients', [client('c1')])
    const db = fresh()

    await runImport(db)
    expect(importDone()).toBe(true)

    const second = await runImport(db)
    expect(second.skipped).toBe(true)
    expect(second.sources).toBe(0)
    expect(second.stores).toEqual([])
  })

  it('deletes what it read, so the space comes back', async () => {
    await plant('rxdb-dexie-tailor_tracker--1--clients', [client('c1')])
    const db = fresh()
    expect(await names()).toContain('rxdb-dexie-tailor_tracker--1--clients')

    await runImport(db)

    expect(await names()).not.toContain('rxdb-dexie-tailor_tracker--1--clients')
    expect(await db.clients.count()).toBe(1)
  })

  it('marks itself done even when there was nothing to import', async () => {
    await runImport(fresh())
    expect(importDone()).toBe(true)
  })

  /* A row that could not be read means the source is not fully transferred.
     Marking that finished would strand the rest of it. */
  it('does not mark itself done when a row could not be read', async () => {
    await plant('rxdb-dexie-tailor_tracker--1--clients', [
      client('c1'),
      { id: 7, _deleted: '0', _meta: META },
    ])
    const db = fresh()

    const report = await runImport(db)

    expect(report.stores[0]?.unusable).toBe(1)
    expect(importDone()).toBe(false)
    expect(await names()).toContain('rxdb-dexie-tailor_tracker--1--clients')
  })

  it('retries on the next launch after an unusable row', async () => {
    await plant('rxdb-dexie-tailor_tracker--1--clients', [
      client('c1'),
      { id: 7, _deleted: '0', _meta: META },
    ])
    const db = fresh()

    await runImport(db)
    const second = await runImport(db)

    expect(second.skipped).toBeUndefined()
    expect(second.sources).toBe(1)
  })

  it('leaves a soft-deleted row deleted rather than dropping it', async () => {
    await plant('rxdb-dexie-tailor_tracker--1--clients', [
      client('c1'),
      client('c2', { _deleted: '1' }),
    ])
    const db = fresh()

    await runImport(db)

    expect(await db.clients.count()).toBe(2)
    expect((await db.clients.get('c2'))?.deleted_at).toBeTypeOf('string')
  })
})
