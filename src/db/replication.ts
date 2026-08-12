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
import type { SupabaseClient } from '@supabase/supabase-js'
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
 * Every RxDB schema here types an optional column as plain `string`/`enum`
 * (no `null` in the type) -- Postgres NULL and "key absent" mean the same
 * thing to RxDB, so a fetched row with any unset optional column needs its
 * nulls stripped before RxDB will accept it.
 */
function dropNullFields<T extends object>(row: T): T {
  const clean = { ...row } as Record<string, unknown>
  for (const key of Object.keys(clean)) {
    if (clean[key] === null) delete clean[key]
  }
  return clean as T
}

/**
 * The Supabase plugin's pull handler was the first place this bit -- it does
 * a raw `flatClone(row)` with no null handling, so a fresh pull of any row
 * with an unset optional column threw RC_PULL and wedged replication (fixed
 * with the `pull.modifier` below). But the plugin *also* reads rows directly
 * -- via `fetchById`, used to resolve a write conflict on push -- through
 * its own un-modified `rowToDoc`, bypassing that modifier entirely. That
 * second path surfaced as RC_PUSH the first time a real push conflict
 * actually happened (rapid sequential patches racing the same document).
 *
 * `pull.modifier` cannot fix the second path -- it only wraps the main pull
 * handler's own result, not the plugin's internal conflict-resolution
 * fetch. So the strip has to happen one level lower, on every row the
 * plugin ever reads, regardless of which of its internal code paths reads
 * it. Wrapping the client's `.from()` is that one place: `select`/`insert`/
 * `update` each start a fresh chain, and every filter/modifier call in
 * postgrest-js (`.eq()`, `.order()`, `.limit()`, ...) returns the same
 * builder instance (`return this`), so patching `.then()` once, right where
 * the chain starts, catches the result no matter what gets chained after it.
 *
 * Scoped to a client used only for replication -- the shared `getSupabase()`
 * client keeps real `null`s for `src/online/*`, whose types mean it (e.g.
 * `Product.category_id: string | null`).
 */
function withNullStrippedRows<T extends PromiseLike<{ data: unknown; error: unknown }>>(builder: T): T {
  // Patching a third-party builder's `.then` at runtime has no structurally
  // sound generic type -- see the block comment above for what this does and why.
  const mutable = builder as any
  const originalThen = mutable.then.bind(builder)
  mutable.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    originalThen((result: { data: unknown; error: unknown }) => {
      const stripped = Array.isArray(result.data)
        ? result.data.map((row) => (row && typeof row === 'object' ? dropNullFields(row) : row))
        : result.data && typeof result.data === 'object'
          ? dropNullFields(result.data)
          : result.data
      return onFulfilled?.({ ...result, data: stripped })
    }, onRejected)
  return builder
}

function replicationClient(client: SupabaseClient): SupabaseClient {
  return {
    channel: client.channel.bind(client),
    removeChannel: client.removeChannel.bind(client),
    from(table: string) {
      const queryBuilder = client.from(table)
      return {
        select: (...args: Parameters<typeof queryBuilder.select>) =>
          withNullStrippedRows(queryBuilder.select(...args)),
        insert: (...args: Parameters<typeof queryBuilder.insert>) =>
          withNullStrippedRows(queryBuilder.insert(...args)),
        update: (...args: Parameters<typeof queryBuilder.update>) =>
          withNullStrippedRows(queryBuilder.update(...args)),
      }
    },
    // Nothing else in rxdb/plugins/replication-supabase calls the client --
    // confirmed by reading its source, not assumed (see the git history for
    // this file). Anything beyond from/channel/removeChannel throwing here
    // is a signal the plugin changed and this wrapper needs to widen.
  } as unknown as SupabaseClient
}

export type ReplicationHandle = {
  /** Resolves once every collection has completed one full initial sync. */
  awaitInitialReplication(): Promise<void>
  /** Cancels every replication. Call on logout. */
  stop(): Promise<void>
  /** Emits an error from any collection's replication. */
  onError(listener: (err: unknown) => void): () => void
  /** Emits whenever a document actually moves, in either direction. */
  onProgress(listener: () => void): () => void
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

  const client = replicationClient(getSupabase())

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
    onProgress(listener) {
      const subs = states.flatMap((s) => [
        s.received$.subscribe(() => listener()),
        s.sent$.subscribe(() => listener()),
      ])
      return () => subs.forEach((sub) => sub.unsubscribe())
    },
  }

  return active
}

/** Cancels replication if it is running. Safe to call when it is not. */
export async function stopReplication(): Promise<void> {
  await active?.stop()
}
