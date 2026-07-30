/**
 * This is a Phase 0 placeholder screen -- it exists only to confirm the
 * scaffold (Preact + Tailwind + PWA install + RxDB init) is wired up
 * correctly. The real screens (staff picker, dashboard, clients, orders...)
 * are Phase 1 work -- see IMPLEMENTATION_PLAN.md.
 */
import { useEffect, useState } from 'preact/hooks'
import { getDatabase } from './db/database'

export function App() {
  const [dbStatus, setDbStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    getDatabase()
      .then(() => setDbStatus('ready'))
      .catch((err) => {
        console.error('RxDB init failed:', err)
        setDbStatus('error')
      })
  }, [])

  return (
    <main class="min-h-svh flex items-center justify-center bg-gray-50 px-4">
      <div class="max-w-md w-full space-y-4 text-center">
        <h1 class="text-2xl font-semibold text-gray-900">Tailor & Rental Tracker</h1>
        <p class="text-gray-500 text-sm">
          Phase 0 scaffold. Real screens start in Phase 1 -- see IMPLEMENTATION_PLAN.md.
        </p>

        <div class="rounded-lg border border-gray-200 bg-white p-4 text-left text-sm space-y-2">
          <div class="flex justify-between">
            <span class="text-gray-500">Network</span>
            <span class={online ? 'text-green-600' : 'text-amber-600'}>
              {online ? 'online' : 'offline (this is fine -- try it)'}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Local database (RxDB)</span>
            <span
              class={
                dbStatus === 'ready'
                  ? 'text-green-600'
                  : dbStatus === 'error'
                    ? 'text-red-600'
                    : 'text-gray-400'
              }
            >
              {dbStatus}
            </span>
          </div>
        </div>

        <p class="text-xs text-gray-400">
          If "Local database" says ready even with the network off, the offline-first
          setup is working.
        </p>
      </div>
    </main>
  )
}
