/* Taking what the server has. Runs after a push, so a row this device owes is
   never overwritten by an older copy of itself. */
import type { PolysterDatabase } from '../dexie/database'
import type { SyncedStore } from '../dexie/stores'
import { PUSH_ORDER } from './order'
import { EPOCH, fromWire, nextCursor, pendingIds, shouldAccept, type Row } from './plan'

export interface PullReport {
  applied: number
  /** Rows held back because this device still owes an edit on them. */
  heldBack: number
  stores: { store: SyncedStore; applied: number; through: string }[]
}

export interface Source {
  /* Rows modified after `since`, oldest first. The order matters: the cursor
     only passes a row once everything before it has been seen. */
  since(store: SyncedStore, since: string, limit: number): Promise<Row[]>
}

const BATCH = 500

export async function pullChanges(db: PolysterDatabase, source: Source): Promise<PullReport> {
  const report: PullReport = { applied: 0, heldBack: 0, stores: [] }
  const outbox = await db.sync_outbox.toArray()

  for (const store of PUSH_ORDER) {
    const cursor = (await db.sync_cursors.get(store))?.pulled_through ?? EPOCH
    const rows = await source.since(store, cursor, BATCH)
    if (rows.length === 0) continue

    const pending = pendingIds(outbox, store)
    const accepted = rows.filter((row) => shouldAccept(String(row.id), pending))
    report.heldBack += rows.length - accepted.length

    const through = nextCursor(rows, cursor)

    await db.transaction('rw', [db.table(store), db.sync_cursors], async () => {
      if (accepted.length > 0) {
        await db.table(store).bulkPut(accepted.map(fromWire))
      }
      /* Moves for the whole batch, held-back rows included: their own push
         brings them round, and standing still re-delivers this batch forever. */
      await db.sync_cursors.put({ id: store, pulled_through: through, at: new Date().toISOString() })
    })

    report.applied += accepted.length
    report.stores.push({ store, applied: accepted.length, through })
  }

  return report
}

/** Forgets where every pull got to, so the next one takes everything again. */
export async function resetCursors(db: PolysterDatabase): Promise<void> {
  await db.sync_cursors.clear()
}
