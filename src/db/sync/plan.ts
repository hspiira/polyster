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

/* How far a pull got. The newest `_modified` in the batch, or the cursor it
   started from when the batch was empty. Never the device's clock. */
export function nextCursor(rows: readonly Row[], current: string): string {
  let newest = current
  for (const row of rows) {
    const value = row[SERVER_CURSOR_COLUMN]
    if (typeof value === 'string' && value > newest) newest = value
  }
  return newest
}

/** The ids in a batch of outbox entries, for deciding what a pull may overwrite. */
export function pendingIds(entries: readonly OutboxEntry[], store: SyncedStore): Set<string> {
  return new Set(entries.filter((entry) => entry.store === store).map((entry) => entry.row_id))
}

/** Where the cursor starts: before any row the server could hold. */
export const EPOCH = '1970-01-01T00:00:00.000Z'
