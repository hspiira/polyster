/* Bidirectional sync via rxdb/plugins/replication-supabase. Start only after
   shop login: RLS has nothing to scope to before that, so it syncs zero rows. */
import { replicateSupabase } from 'rxdb/plugins/replication-supabase'
import type { RxReplicationState } from 'rxdb/plugins/replication'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from '../lib/supabaseClient'
import type { AppDatabase, Collections } from './database'

/* RxDB collection -> Supabase table. 1:1 today, explicit so a divergence would
   be visible rather than assumed. */
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

/* RxDB types optional columns without `null`, so a fetched row with an unset
   optional column needs its nulls stripped before RxDB accepts it. */
export function dropNullFields<T extends object>(row: T): T {
  const clean = { ...row } as Record<string, unknown>
  for (const key of Object.keys(clean)) {
    if (clean[key] === null) delete clean[key]
  }
  return clean as T
}

/* `pull.modifier` cannot cover the plugin's internal `fetchById`, so the strip
   happens on every row it reads. Replication-only: src/online/* wants nulls. */
export function withNullStrippedRows<T extends PromiseLike<{ data: unknown; error: unknown }>>(builder: T): T {
  // Patching a third-party builder's `.then` at runtime has no structurally
  // sound generic type -- see the block comment above for what this does and why.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
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

export function replicationClient(client: SupabaseClient): SupabaseClient {
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
    // Nothing else in the plugin calls the client, confirmed by reading its
    // source. A throw here means the plugin changed and this must widen.
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

/* Starts replication for every synced collection. Idempotent: a second call
   returns the existing handle rather than opening duplicate channels. */
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
