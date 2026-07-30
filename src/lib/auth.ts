/**
 * Shop-level authentication.
 *
 * One Supabase account per shop (ARCHITECTURE.md section 4). Staff PINs are a
 * separate, app-layer attribution check layered on top of this -- they are not
 * part of auth and are not handled here.
 *
 * ## Why there is an `offline_stale` state
 *
 * Supabase persists the session in localStorage, so a shop that signed in once
 * reopens the app straight into it, with no network. But access tokens expire,
 * and refreshing one needs connectivity. An app whose core constraint is
 * "must keep working with no internet" cannot lock the till because a JWT
 * aged out overnight.
 *
 * So a device that has signed in before and cannot reach Supabase now enters
 * `offline_stale`: the local database is fully readable and writable, and
 * replication simply does not run. Writes queue in RxDB and push when the
 * session is restored. The UI is expected to say so plainly rather than hide
 * it -- unsynced work the user does not know about is the failure mode worth
 * avoiding here.
 *
 * This is not a security hole. RLS is enforced server-side on every synced
 * byte; an expired token syncs nothing at all. The local copy on a device is
 * data that device already legitimately pulled.
 */
import type { Session } from '@supabase/supabase-js'
import { getSupabase, isSupabaseConfigured } from './supabaseClient'

const REMEMBERED_USER_KEY = 'tailor_tracker.last_shop_user_id'

export type AuthState =
  /** Initial state, before the persisted session has been read. */
  | { status: 'checking' }
  /** No Supabase credentials configured. Local-only, no sync, no login screen. */
  | { status: 'local_only' }
  /** No session and no remembered login. Show the login screen. */
  | { status: 'signed_out' }
  /** Live session. Replication runs. */
  | { status: 'signed_in'; userId: string }
  /** Signed in before, no live session reachable now. Local-only until online. */
  | { status: 'offline_stale'; userId: string }

export type AuthListener = (state: AuthState) => void

function rememberUser(userId: string): void {
  try {
    localStorage.setItem(REMEMBERED_USER_KEY, userId)
  } catch {
    // Private browsing or a full quota. Losing the hint costs an extra login
    // prompt, nothing more, so it is not worth failing the sign-in over.
  }
}

function forgetUser(): void {
  try {
    localStorage.removeItem(REMEMBERED_USER_KEY)
  } catch {
    /* see rememberUser */
  }
}

function rememberedUser(): string | null {
  try {
    return localStorage.getItem(REMEMBERED_USER_KEY)
  } catch {
    return null
  }
}

export interface AuthController {
  getState(): AuthState
  subscribe(listener: AuthListener): () => void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  /** Re-checks for a live session. Called when the device comes back online. */
  refresh(): Promise<void>
  dispose(): void
}

export function createAuthController(): AuthController {
  let state: AuthState = { status: 'checking' }
  const listeners = new Set<AuthListener>()

  function setState(next: AuthState): void {
    state = next
    listeners.forEach((listener) => listener(state))
  }

  function applySession(session: Session | null): void {
    if (session?.user) {
      rememberUser(session.user.id)
      setState({ status: 'signed_in', userId: session.user.id })
      return
    }

    const remembered = rememberedUser()
    if (remembered) {
      // A previously signed-in device with no usable session. Offline is the
      // common cause; an explicit sign-out clears the hint, so this does not
      // trap a user who meant to log out.
      setState({ status: 'offline_stale', userId: remembered })
    } else {
      setState({ status: 'signed_out' })
    }
  }

  let unsubscribeAuth: (() => void) | null = null

  if (!isSupabaseConfigured()) {
    setState({ status: 'local_only' })
  } else {
    const supabase = getSupabase()

    void supabase.auth
      .getSession()
      .then(({ data }) => applySession(data.session))
      .catch(() => applySession(null))

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
    })
    unsubscribeAuth = () => data.subscription.unsubscribe()
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },

    async signIn(email, password) {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase is not configured -- this build cannot sign in or sync.')
      }
      const { data, error } = await getSupabase().auth.signInWithPassword({ email, password })
      if (error) throw error
      applySession(data.session)
    },

    async signOut() {
      forgetUser()
      if (isSupabaseConfigured()) {
        // `local` scope, not the default `global`: signing out on the shop
        // phone should not invalidate the session on the shop's tablet.
        await getSupabase().auth.signOut({ scope: 'local' })
      }
      setState({ status: 'signed_out' })
    },

    async refresh() {
      if (!isSupabaseConfigured()) return
      try {
        const { data } = await getSupabase().auth.getSession()
        applySession(data.session)
      } catch {
        applySession(null)
      }
    },

    dispose() {
      unsubscribeAuth?.()
      listeners.clear()
    },
  }
}
