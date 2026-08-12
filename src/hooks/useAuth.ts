import { useEffect, useMemo, useState } from 'preact/hooks'
import { createAuthController, type AuthController, type AuthState } from '../lib/auth'
import { useOnline } from './useOnline'

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

  useEffect(() => {
    if (online && (state.status === 'offline_stale' || state.status === 'session_expired')) {
      void controller.refresh()
    }
  }, [online, state.status, controller])

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
