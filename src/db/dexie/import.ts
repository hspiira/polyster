/* Moves a shop off RxDB's databases into ours. Safe to run more than once. */
import { STORE_NAMES, type StoreName } from './stores'
import { getDatabase, type PolysterDatabase } from './database'
import {
  newestPerCollection,
  parseSource,
  toStoredRow,
  type RxdbSource,
  type StoredRow,
} from './importRow'

/** The name RxDB's databases were kept under. */
const RXDB_NAME = 'tailor_tracker'

const DONE_KEY = 'polyster.rxdb_import_done'

/* Whether the import has already finished on this device. Without it the app
   re-opens up to fourteen databases on every launch, forever. */
export function importDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) !== null
  } catch {
    // Private browsing. Discovery runs again and finds nothing.
    return false
  }
}

function markImportDone(): void {
  try {
    localStorage.setItem(DONE_KEY, new Date().toISOString())
  } catch {
    // Not worth failing a successful import over.
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    // Resolves either way: reclaiming the space is best effort, and a blocked
    // delete must not stop the app opening.
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

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
  /** True when the import had already finished on a previous launch. */
  skipped?: boolean
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

/* Runs once per device. Later launches skip discovery entirely, and the
   databases that were read are deleted so the space comes back. */
export async function runImport(db: PolysterDatabase = getDatabase()): Promise<ImportReport> {
  if (importDone()) return { sources: 0, stores: [], written: 0, unknown: [], skipped: true }

  const report = await run(db, true)

  /* Only once every source was read without an unusable row left behind: a
     partial read must be retried on the next launch, not marked finished. */
  const clean = report.stores.every((store) => store.unusable === 0)
  if (clean) {
    markImportDone()
    for (const store of report.stores) await deleteDatabase(store.from)
  }

  return report
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
