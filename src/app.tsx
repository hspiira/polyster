/**
 * Application root.
 *
 * The order is the point: open the database, mount ShopProvider so local data
 * is known, then decide the screen. Deciding from `auth.status` alone is what
 * made `local_only` and `offline_stale` skip the landing entirely, and reading
 * an unresolved shop query as "no shop" is what reopened the first-run wizard
 * on every cold start. See lib/entryState.ts.
 */
import { LocationProvider } from 'preact-iso'
import { useCallback, useState } from 'preact/hooks'
import { useAuth } from './hooks/useAuth'
import { useAutoLock } from './hooks/useAutoLock'
import { useDatabase } from './hooks/useDatabase'
import { useOnline } from './hooks/useOnline'
import { useReplication } from './hooks/useReplication'
import { ShopProvider, useShop } from './state/ShopProvider'
import { Landing } from './screens/entry/Landing'
import { SignIn } from './screens/entry/SignIn'
import { isSupabaseConfigured } from './lib/supabaseClient'
import { LockScreen } from './screens/entry/LockScreen'
import { SetupFlow } from './screens/setup/SetupFlow'
import { Shell } from './screens/Shell'
import { Logomark } from './components/Logomark'
import { decideEntryScreen } from './lib/entryState'
import { DEFAULT_LOCK_AFTER_MINUTES } from './lib/lockPolicy'
import type { AppDatabase } from './db/database'
import type { AuthState } from './lib/auth'

export function App() {
  const { state: auth } = useAuth()
  const database = useDatabase()

  if (database.status === 'error') return <FatalError error={database.error} />
  if (database.status === 'loading') return <Splash />

  return (
    <ShopProvider db={database.db}>
      <LocationProvider>
        <Entry auth={auth} db={database.db} />
      </LocationProvider>
    </ShopProvider>
  )
}

function Entry({ auth, db }: { auth: AuthState; db: AppDatabase }) {
  const online = useOnline()
  const { shop, staff, activeStaff, setActiveStaff, loaded } = useShop()
  const replication = useReplication(db, auth.status === 'signed_in')

  // Latched, not derived: creating the shop and first staff member makes
  // `provisioned` true, and a plain condition would tear the wizard down
  // mid-flow. It stays up until it says it has finished.
  const [setupRunning, setSetupRunning] = useState(false)

  const lock = useCallback(() => setActiveStaff(null), [setActiveStaff])
  useAutoLock(DEFAULT_LOCK_AFTER_MINUTES, lock)

  const provisioned = Boolean(shop) && staff.length > 0

  const screen = decideEntryScreen({
    dbStatus: loaded ? 'ready' : 'loading',
    authStatus: auth.status,
    provisioned: provisioned && !setupRunning,
    locked: !activeStaff,
  })

  if (screen === 'splash') return <Splash />

  if (screen === 'landing') {
    return <SignedOut onStartSetup={() => setSetupRunning(true)} />
  }

  if (screen === 'setup') {
    return <SetupFlow onDone={() => setSetupRunning(false)} />
  }

  if (screen === 'lock') return <LockScreen authStatus={auth.status} />

  return <Shell online={online} auth={auth} replication={replication} />
}

/**
 * The signed-out half: landing, then either sign-in or setup.
 *
 * Local state rather than routes -- the router lives inside the authenticated
 * shell, and standing one up out here to toggle between two screens would be
 * more machinery than the job needs.
 */
function SignedOut({ onStartSetup }: { onStartSetup: () => void }) {
  const [view, setView] = useState<'landing' | 'signIn'>('landing')

  if (view === 'signIn') return <SignIn onCancel={() => setView('landing')} />

  // A build with no Supabase credentials cannot send a code, so it must not
  // offer to -- it goes straight to setting the shop up on this device.
  return (
    <Landing
      onContinue={() => (isSupabaseConfigured() ? setView('signIn') : onStartSetup())}
    />
  )
}

function Splash() {
  return (
    <main class="flex min-h-svh items-center justify-center bg-[#0f1e52]">
      <Logomark size={44} class="animate-pulse text-brand-300" />
    </main>
  )
}

function FatalError({ error }: { error: Error }) {
  return (
    <main class="flex min-h-svh items-center justify-center bg-stone-950 px-6 text-stone-100">
      <div class="max-w-md space-y-3 text-center">
        <h1 class="text-xl font-semibold">The local database did not open</h1>
        <p class="text-sm text-stone-400">
          Nothing has been lost, but this device cannot record work until it does. Reloading the
          app is worth trying first.
        </p>
        <pre class="overflow-x-auto rounded-control bg-black p-3 text-left text-xs text-stone-100">
          {error.message}
        </pre>
      </div>
    </main>
  )
}
