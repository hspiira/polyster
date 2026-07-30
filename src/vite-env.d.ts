/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/**
 * Typed build-time environment. Declared as `string | undefined` on purpose:
 * these are genuinely absent in a fresh clone, and the app is required to keep
 * working without them (offline-only, no sync). See lib/supabaseClient.ts.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
