/**
 * Development-only affordances.
 *
 * The whole component compiles out of production: `import.meta.env.DEV` is a
 * statically-known constant, so Rollup drops this and the dynamic import of
 * the seed data with it. Nothing here reaches a shop's phone.
 */
import { useState } from 'preact/hooks'
import { useShop } from '../state/ShopProvider'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { SEED_PIN } from './seed'

export function DevTools() {
  if (!import.meta.env.DEV) return null
  return <DevPanel />
}

function DevPanel() {
  const { db } = useShop()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Seeding writes rows that look like real shop data, and replication would
  // push them to the configured project. The seed module refuses too; this
  // just avoids offering a button that cannot work.
  if (isSupabaseConfigured()) {
    return (
      <p class="rounded-lg border border-dashed border-gray-300 p-2 text-xs text-gray-500">
        Dev tools hidden: Supabase is configured, so seeding would push fixture data to the real
        project.
      </p>
    )
  }

  async function runSeed() {
    setBusy(true)
    setMessage(null)
    try {
      const { seedIfEmpty } = await import('./seed')
      const result = await seedIfEmpty(db)
      setMessage(
        result
          ? `Seeded ${result.clients.length} clients and ${result.orders.length} orders. Every PIN is ${SEED_PIN}.`
          : 'A shop already exists on this device, so nothing was seeded.',
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Seeding failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="rounded-lg border border-dashed border-gray-300 p-3 text-left">
      <p class="text-xs font-medium text-gray-700">Development</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void runSeed()}
        class="mt-2 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm
               text-gray-800 disabled:opacity-50"
      >
        {busy ? 'Seeding...' : 'Seed sample shop data'}
      </button>
      {message && <p class="mt-2 text-xs text-gray-600">{message}</p>}
    </div>
  )
}
