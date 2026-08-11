/**
 * Wires up bidirectional sync between the local RxDB collections and their
 * matching Supabase tables, using RxDB's official Supabase replication
 * plugin (rxdb/plugins/replication-supabase).
 *
 * Two things confirmed by reading the plugin source (rxdb ^17.4.0,
 * node_modules/rxdb/dist/esm/plugins/replication-supabase/index.js) rather
 * than assumed, since a wrong config here fails silently -- a replication that
 * never starts pulling or pushing -- rather than with a clear error:
 *
 *  - `pull: {}` / `push: {}` (empty objects) are enough to turn each
 *    direction on; batchSize etc. are optional and default sensibly.
 *  - `replicationIdentifier` doubles as the Supabase Realtime channel name,
 *    so it must be unique per collection or two replications collide on the
 *    same channel.
 *
 * `_modified` and `_deleted` are Postgres columns only. They are deliberately
 * absent from the RxDB schemas -- see the header comment in ./schema.ts for
 * why, and why the plugin does not need them there.
 *
 * Call `startReplication()` once the shop-level Supabase login has succeeded,
 * not before: RLS (see supabase/migrations/0001_init.sql) has nothing to scope
 * the sync to until a shop is authenticated, so an early start syncs zero rows
 * and looks like a broken connection.
 */
import { replicateSupabase } from 'rxdb/plugins/replication-supabase'
import type { RxReplicationState } from 'rxdb/plugins/replication'
import { getSupabase, isSupabaseConfigured } from '../lib/supabaseClient'
import type { AppDatabase, Collections } from './database'

/**
 * RxDB collection name -> Supabase table name. Currently 1:1, kept explicit so
 * a divergence would be visible rather than assumed.
 */
export const REPLICATED_TABLES = [
  'shops',
  'staff',
  'clients',
  'measurement_fields',
  'measurement_profiles',
  'orders',
  'payments',
  'order_stage_history',
  'order_units',
  'sales',
  'expenses',
  'message_log',
] as const satisfies readonly (keyof Collections)[]

export type ReplicationHandle = {
  /** Resolves once every collection has completed one full initial sync. */
  awaitInitialReplication(): Promise<void>
  /** Cancels every replication. Call on logout. */
  stop(): Promise<void>
  /** Emits an error from any collection's replication. */
  onError(listener: (err: unknown) => void): () => void
}

let active: ReplicationHandle | null = null

/**
 * Starts replication for every synced collection. Idempotent: calling it twice
 * returns the existing handle rather than opening a second set of Realtime
 * channels on the same names.
 */
export function startReplication(db: AppDatabase): ReplicationHandle | null {
  if (active) return active

  if (!isSupabaseConfigured()) {
    console.warn('[replication] Supabase not configured -- running fully offline, no sync.')
    return null
  }

  const client = getSupabase()

  const states = REPLICATED_TABLES.map((tableName) => {
    const collection = db.collections[tableName]
    if (!collection) {
      throw new Error(`[replication] No RxDB collection registered for "${tableName}"`)
    }

    return replicateSupabase({
      replicationIdentifier: `tailor-tracker-${tableName}`,
      collection,
      client,
      tableName,
      live: true,
      pull: {},
      push: {},
    })
    // The generic is erased across the heterogeneous collection list; the
    // handle below only uses the shared RxReplicationState surface.
  }) as unknown as RxReplicationState<unknown, unknown>[]

  active = {
    async awaitInitialReplication() {
      await Promise.all(states.map((s) => s.awaitInitialReplication()))
    },
    async stop() {
      await Promise.all(states.map((s) => s.cancel()))
      active = null
    },
    onError(listener) {
      const subs = states.map((s) => s.error$.subscribe(listener))
      return () => subs.forEach((sub) => sub.unsubscribe())
    },
  }

  return active
}

/** Cancels replication if it is running. Safe to call when it is not. */
export async function stopReplication(): Promise<void> {
  await active?.stop()
}
