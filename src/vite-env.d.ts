/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/* `string | undefined` on purpose: these are absent in a fresh clone and the
   app must keep working without them, offline-only. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
