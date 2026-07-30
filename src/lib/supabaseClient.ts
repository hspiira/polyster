/**
 * Supabase client, used for two things: replication (see ../db/replication.ts)
 * and shop-level auth (see ARCHITECTURE.md section 4 -- one Supabase account
 * per shop, staff PINs are an app-layer attribution check on top).
 *
 * Never talk to Supabase directly from UI components -- reads/writes go
 * through RxDB (see ../db/database.ts). This client is only used by the
 * replication layer and the auth screen.
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Loud in dev, rather than a confusing downstream failure the first time
  // something tries to sync. See .env.example for what to set.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
      'Copy .env.example to .env and fill in your Supabase project details. ' +
      'The app will still run offline-only without them.',
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey)
}
