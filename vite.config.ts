import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
        name: 'Tailor & Rental Tracker',
        short_name: 'Tailor Tracker',
        description: 'Offline-first order, measurement, and payment tracker for cloth tailoring and rental shops.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#111827',
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
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
