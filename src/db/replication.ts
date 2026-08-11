/**
 * Bidirectional sync between local RxDB collections and their Supabase
 * tables, via rxdb/plugins/replication-supabase. `pull: {}` / `push: {}`
 * are enough to turn each direction on; `replicationIdentifier` doubles as
 * the Realtime channel name, so it must be unique per collection.
 *
 * Call `startReplication()` only after shop-level login succeeds -- RLS has
 * nothing to scope to before that, so an early start just syncs zero rows.
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
  'tenant_features',
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
