import { useEffect, useMemo, useState } from 'preact/hooks'
import { createAuthController, type AuthController, type AuthState } from '../lib/auth'
import { useOnline } from './useOnline'

/**
 * The single auth controller for the app. Created once and shared, so a
 * remount does not open a second `onAuthStateChange` subscription.
 */
let shared: AuthController | null = null

function sharedController(): AuthController {
  if (!shared) shared = createAuthController()
  return shared
}

export function useAuth(): { state: AuthState; controller: AuthController } {
  const controller = useMemo(sharedController, [])
  const [state, setState] = useState<AuthState>(() => controller.getState())
  const online = useOnline()

  useEffect(() => controller.subscribe(setState), [controller])

  // Coming back online is the moment a stale session can be renewed. Without
  // this the app stays in offline_stale until the next reload, and replication
  // never restarts.
  useEffect(() => {
    if (online && state.status === 'offline_stale') {
      void controller.refresh()
    }
  }, [online, state.status, controller])

  return { state, controller }
}
