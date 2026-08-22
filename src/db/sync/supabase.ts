/* The Supabase side of push and pull. Nothing here decides anything -- the
   rules are in ./plan.ts and the drain is in ./push.ts and ./pull.ts. */
import { getSupabase } from '../../lib/supabaseClient'
import type { SyncedStore } from '../dexie/stores'
import { SERVER_CURSOR_COLUMN, type Row } from './plan'
import type { Remote } from './push'
import type { Source } from './pull'

export function supabaseRemote(): Remote {
  return {
    async insert(store, payload) {
      const { error } = await getSupabase().from(store).insert(payload)
      if (error) throw asError(error)
    },

    /* Partial, so an untouched column keeps what the other device put there.
       The guard stops Monday's offline edit overwriting Tuesday's. */
    async update(store, id, payload, updatedAt) {
      const { data, error } = await getSupabase()
        .from(store)
        .update(payload)
        .eq('id', id)
        .lte('updated_at', updatedAt)
        .select('id')

      if (error) throw asError(error)

      /* Nothing matched: either the server holds a newer row and the guard did
         its job, or there is no row and the caller inserts. */
      return (data?.length ?? 0) > 0
    },
  }
}

export function supabaseSource(): Source {
  return {
    async since(store: SyncedStore, since: string, limit: number): Promise<Row[]> {
      const { data, error } = await getSupabase()
        .from(store)
        .select('*')
        .gt(SERVER_CURSOR_COLUMN, since)
        .order(SERVER_CURSOR_COLUMN, { ascending: true })
        .limit(limit)

      if (error) throw asError(error)
      return (data ?? []) as Row[]
    },
  }
}

/* Supabase reports errors as objects, not Errors, so the code survives to
   ./push.ts where a duplicate key decides whether to fall back to an update. */
export function asError(error: { message: string; code?: string }): Error {
  return Object.assign(new Error(error.message), { code: error.code })
}
