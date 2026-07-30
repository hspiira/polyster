/**
 * Application root.
 *
 * Responsibilities, in order: open the local database, establish who the shop
 * is, and only then start replication. That ordering is the point -- see
 * db/replication.ts for why sync must not start before auth.
 *
 * The screens themselves are Phase 1 steps 2-11 in IMPLEMENTATION_PLAN.md and
 * do not exist yet. `Placeholder` below stands in for the authenticated shell
 * and reports the state of the three things Phase 0 exists to prove: the
 * database opened, the session survived, and sync is running.
 */
import { useAuth } from './hooks/useAuth'
import { useDatabase } from './hooks/useDatabase'
import { useOnline } from './hooks/useOnline'
import { useReplication } from './hooks/useReplication'
import { SyncBadge } from './components/SyncBadge'
import { Login } from './screens/Login'
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
    return <Login controller={controller} />
  }

  return (
    <Placeholder
      online={online}
      auth={auth}
      replication={replication}
      controller={controller}
    />
  )
}

function Splash() {
  return (
    <main class="min-h-svh flex items-center justify-center bg-gray-50">
      <p class="text-sm text-gray-500">Opening...</p>
    </main>
  )
}

function FatalError({ error }: { error: Error }) {
  return (
    <main class="min-h-svh flex items-center justify-center bg-gray-50 px-4">
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

interface PlaceholderProps {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
  controller: AuthController
}

/**
 * Stands in for the authenticated app shell until Phase 1 step 2 replaces it.
 * It exists to make the Phase 0 exit checklist checkable by eye on a real
 * phone, which is the only place those items can actually be verified.
 */
function Placeholder({ online, auth, replication, controller }: PlaceholderProps) {
  return (
    <main class="min-h-svh bg-gray-50 px-4 py-10">
      <div class="mx-auto w-full max-w-md space-y-4">
        <header class="flex items-start justify-between gap-3">
          <div>
            <h1 class="text-2xl font-semibold text-gray-900">Tailor &amp; Rental Tracker</h1>
            <p class="text-sm text-gray-500">
              Signed in. Screens start at Phase 1 step 2 -- see IMPLEMENTATION_PLAN.md.
            </p>
          </div>
        </header>

        <SyncBadge online={online} auth={auth} replication={replication} />

        <dl class="rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <Row label="Network" value={online ? 'online' : 'offline (this is fine, try it)'} />
          <Row label="Local database" value="ready" />
          <Row label="Session" value={auth.status.replace(/_/g, ' ')} />
          <Row label="Replication" value={replication.status} />
        </dl>

        {replication.status === 'error' && (
          <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Sync reported an error. Work is still being saved on this device. Details are in the
            browser console.
          </p>
        )}

        <button
          type="button"
          onClick={() => void controller.signOut()}
          class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700"
        >
          Sign out
        </button>
      </div>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div class="flex justify-between gap-4 py-1">
      <dt class="text-gray-500">{label}</dt>
      <dd class="text-gray-900">{value}</dd>
    </div>
  )
}
