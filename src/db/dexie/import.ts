/* Moves a shop off RxDB's databases into ours. Safe to run more than once. */
import { STORE_NAMES, type StoreName } from './stores'
import { getDatabase, type PolysterDatabase } from './database'
import { DATABASE_NAME as RXDB_NAME } from '../database'
import {
  newestPerCollection,
  parseSource,
  toStoredRow,
  type RxdbSource,
  type StoredRow,
} from './importRow'

export interface StoreReport {
  store: StoreName
  from: string
  found: number
  unusable: number
  written: number
  skipped: number
}

export interface ImportReport {
  sources: number
  stores: StoreReport[]
  written: number
  unknown: string[]
}

/** Every IndexedDB database name, or none where databases() is missing. */
async function listDatabases(): Promise<string[]> {
  if (typeof indexedDB.databases !== 'function') return []
  const dbs = await indexedDB.databases()
  return dbs.map((d) => d.name).filter((n): n is string => Boolean(n))
}

function readDocs(database: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('docs')) {
        db.close()
        resolve([])
        return
      }
      const all = db.transaction('docs', 'readonly').objectStore('docs').getAll()
      all.onerror = () => { db.close(); reject(all.error) }
      all.onsuccess = () => { db.close(); resolve(all.result as Record<string, unknown>[]) }
    }
  })
}

async function discover(): Promise<{ sources: RxdbSource[]; unknown: string[] }> {
  const parsed = (await listDatabases())
    .map((name) => parseSource(name, RXDB_NAME))
    .filter((s): s is RxdbSource => s !== null)

  const newest = newestPerCollection(parsed)
  const known = new Set<string>(STORE_NAMES)
  return {
    sources: newest.filter((s) => known.has(s.collection)),
    unknown: newest.filter((s) => !known.has(s.collection)).map((s) => s.collection),
  }
}

/** What an import would do, without writing. */
export async function planImport(db: PolysterDatabase = getDatabase()): Promise<ImportReport> {
  return run(db, false)
}

export async function runImport(db: PolysterDatabase = getDatabase()): Promise<ImportReport> {
  return run(db, true)
}

async function run(db: PolysterDatabase, write: boolean): Promise<ImportReport> {
  const { sources, unknown } = await discover()
  const stores: StoreReport[] = []

  for (const source of sources) {
    const store = source.collection as StoreName
    const raw = await readDocs(source.database)

    const rows: StoredRow[] = []
    let unusable = 0
    for (const item of raw) {
      const row = toStoredRow(item)
      if (row) rows.push(row)
      else unusable++
    }

    const table = db.table(store)
    const existing = new Set(
      (await table.bulkGet(rows.map((r) => r.id))).filter(Boolean).map((r) => (r as StoredRow).id),
    )
    const fresh = rows.filter((r) => !existing.has(r.id))

    if (write && fresh.length > 0) await table.bulkPut(fresh)

    stores.push({
      store,
      from: source.database,
      found: raw.length,
      unusable,
      written: write ? fresh.length : 0,
      skipped: rows.length - fresh.length,
    })
  }

  return {
    sources: sources.length,
    stores,
    written: stores.reduce((sum, s) => sum + s.written, 0),
    unknown,
  }
}
