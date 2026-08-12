/**
 * Supabase client. Used by three things: replication (../db/replication.ts),
 * shop-level auth (ARCHITECTURE.md section 4), and the online-only modules
 * under ../online/ (features added after RxDB's free-tier collection limit
 * was reached -- see docs/POLYSTER.md's Phase 2 status notes. Those modules
 * query Supabase directly and do not work offline; everything else still
 * goes through RxDB, see ../db/database.ts).
 *
 * The client is created lazily rather than at module load. `createClient()`
 * throws `supabaseUrl is required.` on an empty string, so constructing it
 * eagerly would mean a clone without a `.env` file crashes on import -- the
 * opposite of the offline-first behaviour this app promises. Callers check
 * `isSupabaseConfigured()` first; the app runs local-only when it returns
 * false.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

/**
 * The shared Supabase client.
 *
 * @throws if the environment variables are missing. Guard with
 * `isSupabaseConfigured()` -- this deliberately throws rather than returning a
 * half-built client, because a client pointed at nothing fails later, further
 * from the cause.
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
        'Copy .env.example to .env and fill in your Supabase project details. ' +
        'The app runs offline-only without them; call isSupabaseConfigured() first.',
    )
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // One shop account, one shared device, opened dozens of times a day --
        // the session must survive app restarts without a re-login.
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }
  return client
}
