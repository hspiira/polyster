/* Turning an RxDB-on-Dexie row into one of ours. */

export const RXDB_PREFIX = 'rxdb-dexie-'

/* RxDB's own fields, dropped on import. */
const INTERNAL = ['_deleted', '_attachments', '_meta', '_rev'] as const

export interface RxdbSource {
  database: string
  collection: string
  version: number
}

/** Parses `rxdb-dexie-<db>--<version>--<collection>`, or null. */
export function parseSource(database: string, appDatabase: string): RxdbSource | null {
  if (!database.startsWith(`${RXDB_PREFIX}${appDatabase}--`)) return null
  const rest = database.slice(`${RXDB_PREFIX}${appDatabase}--`.length)
  const [version, ...name] = rest.split('--')
  const collection = name.join('--')
  if (!collection || !/^\d+$/.test(version ?? '')) return null
  if (collection.startsWith('_')) return null
  return { database, collection, version: Number(version) }
}

/** The highest version of each collection; older ones are leftovers. */
export function newestPerCollection(sources: readonly RxdbSource[]): RxdbSource[] {
  const best = new Map<string, RxdbSource>()
  for (const source of sources) {
    const seen = best.get(source.collection)
    if (!seen || source.version > seen.version) best.set(source.collection, source)
  }
  return [...best.values()].sort((a, b) => a.collection.localeCompare(b.collection))
}

export function isDeleted(raw: Record<string, unknown>): boolean {
  const flag = raw._deleted
  return flag === true || flag === '1' || flag === 1
}

/** RxDB's last-write time, ISO. */
function deletedAt(raw: Record<string, unknown>): string {
  const meta = raw._meta as { lwt?: number } | undefined
  const lwt = typeof meta?.lwt === 'number' ? meta.lwt : null
  return new Date(lwt ?? Date.now()).toISOString()
}

export type StoredRow = Record<string, unknown> & { id: string; deleted_at?: string }

/** Strips RxDB's fields and maps its soft delete. Null if the row has no id. */
export function toStoredRow(raw: Record<string, unknown>): StoredRow | null {
  if (typeof raw.id !== 'string' || !raw.id) return null

  const row: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if ((INTERNAL as readonly string[]).includes(key)) continue
    row[key] = value
  }
  if (isDeleted(raw)) row.deleted_at = deletedAt(raw)
  return row as StoredRow
}
