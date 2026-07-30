/**
 * Application root.
 *
 * Responsibilities, in order: open the local database, establish who the shop
 * is, start replication, then find out who is holding the phone. That ordering
 * is the point -- see db/replication.ts for why sync must not start before
 * auth, and screens/StaffGate.tsx for why the staff check comes last.
 */
import { LocationProvider } from 'preact-iso'
import { useEffect, useState } from 'preact/hooks'
import { useAuth } from './hooks/useAuth'
import { useDatabase } from './hooks/useDatabase'
import { useOnline } from './hooks/useOnline'
import { useReplication } from './hooks/useReplication'
import { ShopProvider, useShop } from './state/ShopProvider'
import { Landing } from './screens/Landing'
import { Login } from './screens/Login'
import { StaffGate } from './screens/StaffGate'
import { SetupFlow } from './screens/setup/SetupFlow'
import { Shell } from './screens/Shell'
import type { AuthController, AuthState } from './lib/auth'
import type { ReplicationStatus } from './hooks/useReplication'

export function App() {
  const online = useOnline()
  const { state: auth, controller } = useAuth()
  const database = useDatabase()

  // `offline_stale` deliberately does not start replication: there is no
  // usable session to authorise it. Local reads and writes carry on.
  const authenticated = auth.status === 'signed_in'
  const replication = useReplication(
    database.status === 'ready' ? database.db : null,
    authenticated,
  )

  if (database.status === 'error') {
    return <FatalError error={database.error} />
  }

  if (database.status === 'loading' || auth.status === 'checking') {
    return <Splash />
  }

  if (auth.status === 'signed_out') {
    return <SignedOut controller={controller} />
  }

  return (
    <ShopProvider db={database.db}>
      <LocationProvider>
        <Gate online={online} auth={auth} replication={replication} />
      </LocationProvider>
    </ShopProvider>
  )
}

/**
 * Between the shop account and the app: wait for the shop row, then find out
 * which staff member is using the device.
 */
function Gate({
  online,
  auth,
  replication,
}: {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}) {
  const { shop, staff, activeStaff } = useShop()

  // Latched, not derived: creating the shop/first staff member makes
  // `!shop || staff.length === 0` false, and a plain condition would tear
  // the wizard down mid-flow. It stays up until it says it's finished.
  const [setupRunning, setSetupRunning] = useState(!shop || staff.length === 0)
  const [setupFinished, setSetupFinished] = useState(false)

  useEffect(() => {
    if ((!shop || staff.length === 0) && !setupFinished) setSetupRunning(true)
  }, [shop, staff.length, setupFinished])

  if (setupRunning && !setupFinished) {
    return (
      <SetupFlow
        onDone={() => {
          setSetupFinished(true)
          setSetupRunning(false)
        }}
      />
    )
  }

  if (!activeStaff) {
    return <StaffGate />
  }

  return <Shell online={online} auth={auth} replication={replication} />
}

/**
 * The signed-out half of the app: landing, then login.
 *
 * Two screens rather than one because the people who open this the first time
 * did not choose it -- someone handed them a phone. Dropping straight into an
 * email field asks them to act before they have been told what they are
 * looking at.
 *
 * Local state rather than routes: the router lives inside the authenticated
 * shell, and standing one up out here to toggle between two screens would be
 * more machinery than the job needs.
 */
function SignedOut({ controller }: { controller: AuthController }) {
  const [view, setView] = useState<'landing' | 'login'>('landing')

  if (view === 'login') {
    return <Login controller={controller} onBack={() => setView('landing')} />
  }
  return <Landing onSignIn={() => setView('login')} />
}

function Splash() {
  return (
    <main class="flex min-h-svh items-center justify-center bg-stone-100 dark:bg-stone-950">
      <span class="size-8 animate-spin rounded-full border-2 border-stone-300 border-t-brand-700 dark:border-stone-700 dark:border-t-brand-400" />
    </main>
  )
}

function FatalError({ error }: { error: Error }) {
  return (
    <main class="flex min-h-svh items-center justify-center bg-stone-100 px-6 dark:bg-stone-950">
      <div class="max-w-md space-y-3 text-center">
        <h1 class="text-xl font-semibold">The local database did not open</h1>
        <p class="text-sm text-stone-600 dark:text-stone-300">
          Nothing has been lost, but this device cannot record work until it does. Reloading the
          app is worth trying first.
        </p>
        <pre class="overflow-x-auto rounded-control bg-stone-900 p-3 text-left text-xs text-stone-100 dark:bg-black">
          {error.message}
        </pre>
      </div>
    </main>
  )
}
