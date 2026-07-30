import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
