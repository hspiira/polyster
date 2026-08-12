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
    if (online && (state.status === 'offline_stale' || state.status === 'session_expired')) {
      void controller.refresh()
    }
  }, [online, state.status, controller])

  /**
   * Re-check on resume.
   *
   * `autoRefreshToken` runs on a timer that browsers throttle in a background
   * tab and suspend outright in a backgrounded installed PWA, so a shop that
   * reopens the app after a few hours can hold an expired access token while
   * still reporting `signed_in` -- replication then fails quietly. Reading the
   * session here makes Supabase refresh it before that happens.
   *
   * Deliberately depends only on `controller`: keying it on state as well would
   * re-register on every status change this very call can cause.
   */
  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void controller.refresh()
      }
    }
    document.addEventListener('visibilitychange', onResume)
    return () => document.removeEventListener('visibilitychange', onResume)
  }, [controller])

  return { state, controller }
}
