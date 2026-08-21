/* Bookkeeping this device keeps about syncing. Neither table is synced or
   backed up -- both describe this device's relationship to the server. */
import type { SyncedStore } from '../dexie/stores'

export const SYNC_OPERATIONS = ['created', 'updated', 'deleted'] as const
export type SyncOperation = (typeof SYNC_OPERATIONS)[number]

/* One entry per row waiting to be pushed. Keyed `store:row_id`, so ten edits to
   one row collapse into one entry and the push sends the row as it stands. */
export interface OutboxEntry {
  /** `${store}:${row_id}` */
  id: string
  store: SyncedStore
  row_id: string
  /* 'created' sends the whole row, because the server has no row to merge into.
     'updated' sends only the fields that changed. */
  operation: SyncOperation
  /** Field names changed since the last successful push. Empty when created. */
  fields: string[]
  /** When this row was last touched locally, which is what orders competing edits. */
  updated_at: string
  /** How many pushes have failed on this entry, so a poison row can be reported. */
  attempts: number
  last_error?: string
}

/** Where a pull got to, per store. Server time, never the device's clock. */
export interface SyncCursor {
  /** The store name. */
  id: SyncedStore
  /** The newest `_modified` this device has seen from the server. */
  pulled_through: string
  /** When the last successful pull finished, for the UI. */
  at: string
}
