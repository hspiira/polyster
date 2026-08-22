/* Sending what this device owes. Drains the outbox in dependency order, so a
   row is never written before the row it points at. */
import type { PolysterDatabase } from '../dexie/database'
import type { SyncedStore } from '../dexie/stores'
import type { OutboxEntry } from '../schema'
import { PUSH_ORDER } from './order'
import { toPushItem, type PushItem, type Row } from './plan'

export interface PushReport {
  sent: number
  /** Entries left behind, with the reason on each. */
  failed: { store: SyncedStore; rowId: string; error: string }[]
  dropped: number
}

/* What the transport has to do, kept behind an interface so the whole drain can
   be tested without a network. */
export interface Remote {
  /** Writes a whole row. Must overwrite whatever is there under that id. */
  insert(store: SyncedStore, payload: Row): Promise<void>
  /* Writes only the fields in `payload`, and only if the server's row is not
     newer. Returns false when the server declined because it holds a newer row. */
  update(store: SyncedStore, id: string, payload: Row, updatedAt: string): Promise<boolean>
}

const BATCH = 200

export async function pushOutbox(db: PolysterDatabase, remote: Remote): Promise<PushReport> {
  const report: PushReport = { sent: 0, failed: [], dropped: 0 }

  for (const store of PUSH_ORDER) {
    const entries = await db.sync_outbox.where('store').equals(store).limit(BATCH).toArray()
    if (entries.length === 0) continue

    for (const entry of entries) {
      const row = (await db.table(store).get(entry.row_id)) as Row | undefined
      const item = toPushItem(entry, row)

      if (!item) {
        // Nothing to send, so nothing is owed. Dropping it stops a row that no
        // longer exists being retried forever.
        await db.sync_outbox.delete(entry.id)
        report.dropped++
        continue
      }

      try {
        await send(remote, item)
        await db.sync_outbox.delete(entry.id)
        report.sent++
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await recordFailure(db, entry, message)
        report.failed.push({ store, rowId: entry.row_id, error: message })
      }
    }
  }

  return report
}

/* A create that finds the row there falls back to an update: a push can
   succeed and lose its acknowledgement, and then retries as a create. */
async function send(remote: Remote, item: PushItem): Promise<void> {
  if (item.operation !== 'created') {
    await remote.update(item.store, item.rowId, item.payload, item.updatedAt)
    return
  }

  try {
    await remote.insert(item.store, item.payload)
  } catch (error) {
    if (!isDuplicate(error)) throw error
    await remote.update(item.store, item.rowId, item.payload, item.updatedAt)
  }
}

/** Postgres unique-violation, whichever shape the client reports it in. */
export function isDuplicate(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code
  if (code === '23505' || code === '23000') return true
  const message = error instanceof Error ? error.message : String(error)
  return /duplicate key|already exists/i.test(message)
}

async function recordFailure(
  db: PolysterDatabase,
  entry: OutboxEntry,
  error: string,
): Promise<void> {
  await db.sync_outbox.put({ ...entry, attempts: entry.attempts + 1, last_error: error })
}

/** How much this device still owes, for the UI to show plainly. */
export function countPending(db: PolysterDatabase): Promise<number> {
  return db.sync_outbox.count()
}

/* Entries that keep failing. Surfaced rather than retried silently: a row the
   server will never accept would otherwise block its store forever. */
export async function stuckEntries(
  db: PolysterDatabase,
  after = 5,
): Promise<OutboxEntry[]> {
  return (await db.sync_outbox.toArray()).filter((entry) => entry.attempts >= after)
}
