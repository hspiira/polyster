/**
 * Application root.
 *
 * Responsibilities, in order: open the local database, establish who the shop
 * is, start replication, then find out who is holding the phone. That ordering
 * is the point -- see db/replication.ts for why sync must not start before
 * auth, and screens/StaffGate.tsx for why the staff check comes last.
 */
import { LocationProvider } from 'preact-iso'
import { useAuth } from './hooks/useAuth'
import { useDatabase } from './hooks/useDatabase'
import { useOnline } from './hooks/useOnline'
import { useReplication } from './hooks/useReplication'
import { ShopProvider, useShop } from './state/ShopProvider'
import { Login } from './screens/Login'
import { StaffGate } from './screens/StaffGate'
import { Shell } from './screens/Shell'
import { DevTools } from './dev/DevTools'
import type { AuthState } from './lib/auth'
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
    return <Login controller={controller} />
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
  const { shop, activeStaff } = useShop()

  if (!shop) {
    return <WaitingForShop replication={replication} online={online} />
  }

  if (!activeStaff) {
    return <StaffGate />
  }

  return <Shell online={online} auth={auth} replication={replication} />
}

function Splash() {
  return (
    <main class="flex min-h-svh items-center justify-center bg-gray-50">
      <p class="text-sm text-gray-500">Opening...</p>
    </main>
  )
}

/**
 * The shop row arrives with the first replication pull. On a brand-new device
 * that is a few seconds; with no connectivity it may never come, and saying so
 * beats an indefinite spinner.
 */
function WaitingForShop({
  replication,
  online,
}: {
  replication: ReplicationStatus
  online: boolean
}) {
  const stuck = !online || replication.status === 'error' || replication.status === 'idle'

  return (
    <main class="flex min-h-svh items-center justify-center bg-gray-50 px-4">
      <div class="max-w-sm space-y-3 text-center">
        <h1 class="text-lg font-semibold text-gray-900">Setting up this device</h1>
        {stuck ? (
          <p class="text-sm text-gray-600">
            This device has not received the shop's details yet, and cannot reach the server to
            fetch them. Connect to the internet once and this will complete; afterwards the app
            works offline.
          </p>
        ) : (
          <p class="text-sm text-gray-600">Fetching the shop's details for the first time...</p>
        )}
        <DevTools />
      </div>
    </main>
  )
}

function FatalError({ error }: { error: Error }) {
  return (
    <main class="flex min-h-svh items-center justify-center bg-gray-50 px-4">
      <div class="max-w-md space-y-3 text-center">
        <h1 class="text-xl font-semibold text-gray-900">The local database did not open</h1>
        <p class="text-sm text-gray-600">
          Nothing has been lost, but this device cannot record work until it does. Reloading the
          app is worth trying first.
        </p>
        <pre class="overflow-x-auto rounded-lg bg-gray-900 p-3 text-left text-xs text-gray-100">
          {error.message}
        </pre>
      </div>
    </main>
  )
}
