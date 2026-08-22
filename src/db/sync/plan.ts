/* What to send and what to accept. Pure, so every rule here is testable
   without a network or a database. The transport is in ./push.ts and ./pull.ts. */
import type { SyncedStore } from '../dexie/stores'
import type { OutboxEntry, SyncOperation } from '../schema'

/** The server's own column, never stored on the device. It drives the cursor. */
export const SERVER_CURSOR_COLUMN = '_modified'

export type Row = Record<string, unknown>

export interface PushItem {
  store: SyncedStore
  rowId: string
  operation: SyncOperation
  /* Whole row for a create; only the changed fields for an update, so a field
     this device did not touch keeps what the other device put there. */
  payload: Row
  /** The device's own clock, which is what decides a competing edit. */
  updatedAt: string
}

/* What one outbox entry sends, or null. A row that vanished locally has no
   state to push, and rebuilding it from the entry would invent some. */
export function toPushItem(entry: OutboxEntry, row: Row | undefined): PushItem | null {
  if (!row) return null

  if (entry.operation === 'created') {
    return {
      store: entry.store,
      rowId: entry.row_id,
      operation: 'created',
      payload: forWire(row),
      updatedAt: entry.updated_at,
    }
  }

  const fields = new Set(entry.fields)
  fields.add('updated_at')
  if (entry.operation === 'deleted') fields.add('deleted_at')

  const payload: Row = { id: entry.row_id }
  for (const field of fields) {
    // An absent field is sent as null: the update has to clear it server-side,
    // not leave the other device's value standing.
    payload[field] = field in row ? row[field] : null
  }

  return {
    store: entry.store,
    rowId: entry.row_id,
    operation: entry.operation,
    payload: forWire(payload),
    updatedAt: entry.updated_at,
  }
}

/* Strips what the server owns. `_modified` is set by a trigger, and sending a
   value for it would be the device claiming to know when the server saw a row. */
export function forWire(row: Row): Row {
  const out: Row = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === SERVER_CURSOR_COLUMN) continue
    if (value === undefined) continue
    out[key] = value
  }
  return out
}

/* A server row this device can store. Postgres sends null where the row type
   wants the column absent, and that mismatch broke the old replication. */
export function fromWire(row: Row): Row {
  const out: Row = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === SERVER_CURSOR_COLUMN) continue
    if (value === null) continue
    out[key] = value
  }
  return out
}

/* Whether a pulled row may overwrite what is here. A row this device still
   owes is left alone: its edit is unsent and on screen. */
export function shouldAccept(rowId: string, pending: ReadonlySet<string>): boolean {
  return !pending.has(rowId)
}

/* A timestamp and an id. A bulk write gives many rows one timestamp, and a
   timestamp alone cannot say which of them a page stopped at. */
export interface Cursor {
  modified: string
  id: string
}

const CURSOR_SEPARATOR = '|'

export function serializeCursor(cursor: Cursor): string {
  return `${cursor.modified}${CURSOR_SEPARATOR}${cursor.id}`
}

export function parseCursor(raw: string | undefined): Cursor {
  if (!raw) return { modified: EPOCH, id: '' }
  const at = raw.indexOf(CURSOR_SEPARATOR)
  if (at === -1) return { modified: raw, id: '' }
  return { modified: raw.slice(0, at), id: raw.slice(at + 1) }
}

/** Ascending by timestamp, then by id. The order a pull must read in. */
export function compareCursors(left: Cursor, right: Cursor): number {
  if (left.modified !== right.modified) return left.modified < right.modified ? -1 : 1
  if (left.id === right.id) return 0
  return left.id < right.id ? -1 : 1
}

export function isAfterCursor(candidate: Cursor, cursor: Cursor): boolean {
  return compareCursors(candidate, cursor) > 0
}

export function cursorOf(row: Row): Cursor {
  return { modified: String(row[SERVER_CURSOR_COLUMN] ?? EPOCH), id: String(row.id ?? '') }
}

/* How far a pull got: the furthest row in the batch, or where it started when
   the batch was empty. Never the device's clock, and never backwards. */
export function nextCursor(rows: readonly Row[], current: Cursor): Cursor {
  let furthest = current
  for (const row of rows) {
    const candidate = cursorOf(row)
    if (isAfterCursor(candidate, furthest)) furthest = candidate
  }
  return furthest
}

/** The ids in a batch of outbox entries, for deciding what a pull may overwrite. */
export function pendingIds(entries: readonly OutboxEntry[], store: SyncedStore): Set<string> {
  return new Set(entries.filter((entry) => entry.store === store).map((entry) => entry.row_id))
}

/** Where the cursor starts: before any row the server could hold. */
export const EPOCH = '1970-01-01T00:00:00.000Z'
