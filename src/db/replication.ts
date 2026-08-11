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

/**
 * The Supabase plugin's pull handler does a raw `flatClone(row)` -- an
 * optional column that is simply unset comes back as SQL NULL, but every
 * RxDB schema here types optional fields as plain `string`/`enum` (no
 * `null` in the type), so pulling a fresh row with any unset optional
 * column throws RC_PULL and wedges replication. Postgres NULL and "key
 * absent" both mean the same thing to RxDB's schema, so strip nulls before
 * validation rather than widen every optional property to allow null.
 */
function dropNullFields<T extends object>(doc: T): T {
  const clean = { ...doc } as Record<string, unknown>
  for (const key of Object.keys(clean)) {
    if (clean[key] === null) delete clean[key]
  }
  return clean as T
}

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
      pull: { modifier: dropNullFields },
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
