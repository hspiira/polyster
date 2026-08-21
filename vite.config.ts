import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    /**
     * Vite does not read `PORT` on its own -- it defaults to 5173 and, when
     * that is taken, quietly increments to 5174. Anything that assigns a port
     * out of band and then opens that URL gets a blank page, because the server
     * is somewhere else. Honouring `PORT` makes the assignment authoritative.
     *
     * `strictPort` so a clash fails loudly rather than drifting to a port
     * nobody is watching. Only applied when `PORT` is set, so a plain
     * `pnpm dev` keeps Vite's own find-the-next-free-port behaviour.
     */
    ...(process.env.PORT
      ? { port: Number(process.env.PORT), strictPort: true }
      : {}),
  },
  build: {
    /**
     * Raised from 500 to just above where the entry chunk actually sits, so
     * the warning still fires on new growth instead of being permanently red.
     *
     * The floor is RxDB: the database opens before anything renders, so it
     * cannot be deferred in an offline-first app. Screens are already
     * route-split (see Shell.tsx) and load on navigation.
     *
     * The remaining prize is @supabase/supabase-js, ~203 kB that a local-only
     * shop never uses but still downloads, because `getSupabase()` is
     * synchronous and ~70 call sites across src/online/ depend on that. Making
     * it async would take it off the boot path.
     */
    chunkSizeWarningLimit: 550,
  },
  resolve: {
    /**
     * Belt and braces, not a fix for anything currently broken.
     *
     * `preact-iso` pulls in `preact-render-to-string`, so pnpm materialises a
     * second peer-resolved copy of Preact on disk:
     *
     *   node_modules/.pnpm/preact@10.29.7/                              <- the app
     *   node_modules/.pnpm/preact@10.29.7_preact-render-to-string@6.7.0 <- preact-iso
     *
     * Two Preact runtimes in one page breaks `preact/hooks`, which finds the
     * other copy's renderer and throws "Cannot read properties of undefined
     * (reading '__H')" -- a blank page with one console line.
     *
     * Measured, not assumed: this setting changes nothing today. The
     * production bundle is byte-identical with and without it (same content
     * hash), because Rollup already collapses the two. It is here so that
     * staying collapsed is stated rather than incidental, since the duplicate
     * on disk is real and a future plugin or resolver could pick differently.
     */
    dedupe: ['preact', 'preact/hooks', 'preact/jsx-runtime', 'preact/compat'],
  },
  plugins: [
    preact(),
    tailwindcss(),
    VitePWA({
      // registerType: 'autoUpdate' keeps installed devices on the latest
      // build without staff needing to manually reinstall the app.
      registerType: 'autoUpdate',
      // Registering at the root with scope '/' avoids the classic bug where
      // a service worker only controls the folder it was served from.
      // See ARCHITECTURE.md section 8 / pwa-research-notes.md section 1.
      scope: '/',
      manifest: {
        name: 'Polyster',
        short_name: 'Polyster',
        description: 'Offline-first order, measurement, and payment tracker for cloth tailoring and rental shops.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Hand-matched to theme.css's dark `--meta-theme-color`; a manifest
        // cannot read a CSS variable. Dark either way, because the entry flow
        // the splash leads into is a dark world.
        background_color: '#0d0c12',
        theme_color: '#0d0c12',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the built app shell; runtime data (Supabase calls) is
        // handled by RxDB's local-first layer, not by the service worker.
        // woff2 included: without it the one typeface is a network request the
        // first offline load cannot make, and the app renders in system-ui.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      // Off by default. A live service worker in dev caches aggressively and
      // produces stale-asset confusion that looks like a code bug. Turn it on
      // deliberately (VITE_PWA_DEV=1 pnpm dev) when testing install or offline
      // behaviour, which is the only time it earns its keep.
      devOptions: {
        enabled: process.env.VITE_PWA_DEV === '1',
      },
    }),
  ],
})
