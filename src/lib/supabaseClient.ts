/* Supabase client, built lazily: `createClient('')` throws, so constructing it
   eagerly makes a clone with no .env crash on import. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

/* Throws if the env vars are missing -- guard with `isSupabaseConfigured()`. A
   half-built client pointed at nothing would fail later, further from the cause. */
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
