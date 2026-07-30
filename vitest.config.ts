import { defineConfig } from 'vitest/config'

// Deliberately does NOT reuse vite.config.ts. The PWA plugin would generate a
// service worker on every test run, and the Preact preset is only needed once
// component tests exist.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
