/* Application root. The order is the point: open the database, mount
   ShopProvider, then decide the screen. See lib/entryState.ts. */
import type { VNode } from 'preact'
import { LocationProvider } from 'preact-iso'
import { useCallback, useEffect, useState } from 'preact/hooks'
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
import { Register } from './screens/entry/Register'
import { Logomark } from './components/Logomark'
import { decideEntryScreen, isLocked } from './lib/entryState'
import { DEFAULT_LOCK_AFTER_MINUTES } from './lib/lockPolicy'
import { usePlatform } from './hooks/usePlatform'
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

  const [registering, setRegistering] = useState(false)

  const lock = useCallback(() => setActiveStaff(null), [setActiveStaff])
  useAutoLock(DEFAULT_LOCK_AFTER_MINUTES, lock)

  const provisioned = Boolean(shop) && staff.length > 0
  const locked = isLocked(staff, activeStaff)

  // No PIN means no lock screen, so nothing else would ever attribute the
  // session. Open the device as the only person on it.
  useEffect(() => {
    if (provisioned && !locked && !activeStaff && staff[0]) setActiveStaff(staff[0])
  }, [provisioned, locked, activeStaff, staff, setActiveStaff])

  const screen = decideEntryScreen({
    dbStatus: loaded ? 'ready' : 'loading',
    authStatus: auth.status,
    provisioned,
    locked,
    registering,
    awaitingFirstPull: replication.status === 'syncing',
  })

  if (screen === 'splash') return <Splash />

  if (screen === 'landing') {
    return <SignedOut onStartRegister={() => setRegistering(true)} />
  }

  if (screen === 'register') {
    return <Register onDone={() => setRegistering(false)} />
  }

  if (screen === 'lock') return <LockScreen authStatus={auth.status} />

  return <AppShell online={online} auth={auth} replication={replication} />
}

/* Picks one of the two designs (spec W1, W2). Both surface sync state, so both
   take it: the phone in its status strip, the web at its sidebar foot. */
type ShellProps = {
  online: boolean
  auth: AuthState
  replication: ReturnType<typeof useReplication>
}

/* Only this device's shell is fetched. Imported statically, both shells and
   every screen they reach land in the entry chunk. */
const SHELLS: Record<'web' | 'phone', () => Promise<(props: ShellProps) => VNode>> = {
  web: () => import('./web/WebShell').then((m) => m.WebShell),
  phone: () => import('./screens/Shell').then((m) => m.Shell),
}

function AppShell(props: ShellProps) {
  const platform = usePlatform()
  const [Shell, setShell] = useState<((props: ShellProps) => VNode) | null>(null)

  useEffect(() => {
    let cancelled = false
    void SHELLS[platform === 'web' ? 'web' : 'phone']().then((component) => {
      // Wrapped: a bare component would be read as a state updater.
      if (!cancelled) setShell(() => component)
    })
    return () => {
      cancelled = true
    }
  }, [platform])

  if (!Shell) return <Splash />
  return <Shell {...props} />
}

/* The signed-out half. Local state rather than routes: the router lives inside
   the authenticated shell. */
function SignedOut({ onStartRegister }: { onStartRegister: () => void }) {
  const [view, setView] = useState<'landing' | 'signIn'>('landing')

  if (view === 'signIn') return <SignIn onCancel={() => setView('landing')} />

  return (
    <Landing
      onStart={onStartRegister}
      // A build with no Supabase credentials cannot send a code, so it must not
      // offer a door that needs one.
      onSignIn={isSupabaseConfigured() ? () => setView('signIn') : undefined}
    />
  )
}

function Splash() {
  return (
    <main data-theme="dark" class="flex min-h-svh items-center justify-center bg-brand-950">
      <Logomark size={44} class="animate-pulse text-brand-300" />
    </main>
  )
}

function FatalError({ error }: { error: Error }) {
  return (
    <main class="flex min-h-svh items-center justify-center bg-page px-6 text-content">
      <div class="max-w-md space-y-3 text-center">
        <h1 class="text-xl font-semibold">The local database did not open</h1>
        <p class="text-sm text-content-muted">
          Nothing has been lost, but this device cannot record work until it does. Reloading the
          app is worth trying first.
        </p>
        <pre class="overflow-x-auto rounded-control bg-surface-sunken p-3 text-left text-xs text-content">
          {error.message}
        </pre>
      </div>
    </main>
  )
}
