/**
 * Supabase client, used for two things: replication (see ../db/replication.ts)
 * and shop-level auth (see ARCHITECTURE.md section 4 -- one Supabase account
 * per shop, staff PINs are an app-layer attribution check on top).
 *
 * Never talk to Supabase directly from UI components -- reads/writes go
 * through RxDB (see ../db/database.ts). This client is only used by the
 * replication layer and the auth screen.
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
