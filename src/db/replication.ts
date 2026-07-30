/**
 * Wires up bidirectional sync between the local RxDB collections and their
 * matching Supabase tables, using RxDB's official Supabase replication
 * plugin (rxdb/plugins/replication-supabase).
 *
 * This is written directly against the plugin's actual implementation
 * (rxdb ^17.4.0, node_modules/rxdb/dist/esm/plugins/replication-supabase/index.js)
 * rather than assumed from memory, since a wrong config here fails silently
 * (a replication that never actually starts pulling/pushing) rather than
 * with a clear error. Two things confirmed from reading that source:
 *
 *  - `pull: {}` / `push: {}` (empty objects) are enough to turn each
 *    direction on; batchSize etc. are optional and default sensibly.
 *  - `replicationIdentifier` doubles as the Supabase Realtime channel name,
 *    so it must be unique per collection or two replications will collide
 *    on the same channel.
 *
 * Call `startReplication()` once, after the shop-level Supabase login
 * succeeds -- not before, since RLS (see the migration SQL) has nothing to
 * scope the sync to until a shop is authenticated.
 */
import { replicateSupabase } from 'rxdb/plugins/replication-supabase'
import type { RxDatabase } from 'rxdb'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

// Collection name -> Supabase table name. Currently 1:1, kept as an
// explicit map rather than assumed so it's obvious if that ever changes.
const REPLICATED_TABLES = [
  'shops',
  'staff',
  'clients',
  'measurement_fields',
  'measurement_profiles',
  'orders',
  'payments',
  'order_stage_history',
] as const

export function startReplication(db: RxDatabase) {
  if (!isSupabaseConfigured()) {
    console.warn('[replication] Supabase not configured -- running fully offline, no sync.')
    return []
  }

  return REPLICATED_TABLES.map((tableName) => {
    const collection = (db.collections as Record<string, any>)[tableName]
    if (!collection) {
      throw new Error(`[replication] No RxDB collection registered for "${tableName}"`)
    }

    return replicateSupabase({
      replicationIdentifier: `tailor-tracker-${tableName}`,
      collection,
      client: supabase,
      tableName,
      live: true,
      pull: {},
      push: {},
    })
  })
}
