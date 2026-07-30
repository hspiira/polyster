/**
 * Shop-level authentication, by phone number and a one-time code.
 *
 * One Supabase account per shop (ARCHITECTURE.md section 4). Staff PINs are a
 * separate, app-layer device unlock layered on top -- they are not auth and are
 * not handled here.
 *
 * There is no password. The audience authenticates by phone and short code
 * every day through mobile money, and it lets the code screen and the PIN
 * screen be the same component. See the entry flow spec, decision E1.
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
import { getSupabase, isSupabaseConfigured } from './supabaseClient'
import { toE164 } from './phone'

const REMEMBERED_USER_KEY = 'tailor_tracker.last_shop_user_id'

export type AuthState =
  /** Initial state, before the persisted session has been read. */
  | { status: 'checking' }
  /** No Supabase credentials configured. Local-only, no sync, no code screen. */
  | { status: 'local_only' }
  /** No session and no remembered login. */
  | { status: 'signed_out' }
  /** Live session. Replication runs. */
  | { status: 'signed_in'; userId: string }
  /** Signed in before, no live session reachable now. Local-only until online. */
  | { status: 'offline_stale'; userId: string }

export type AuthListener = (state: AuthState) => void

/** How a one-time code reaches a phone. Config, not a code decision -- spec E2. */
export type CodeChannel = 'sms' | 'whatsapp'

function rememberUser(userId: string): void {
  try {
    localStorage.setItem(REMEMBERED_USER_KEY, userId)
  } catch {
    // Private browsing or a full quota. Losing the hint costs an extra code
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

/**
 * The Supabase surface this module uses, injectable so the controller can be
 * tested without a project or a configured SMS provider.
 */
export interface AuthDeps {
  isConfigured(): boolean
  getSession(): Promise<{ userId: string } | null>
  onAuthStateChange(handler: (session: { userId: string } | null) => void): () => void
  signInWithOtp(e164: string, channel: CodeChannel): Promise<void>
  verifyOtp(e164: string, token: string): Promise<{ userId: string }>
  signOut(): Promise<void>
  channel: CodeChannel
}

export interface AuthController {
  getState(): AuthState
  subscribe(listener: AuthListener): () => void
  /** Sends a one-time code. Throws if the number is ambiguous or sync is unconfigured. */
  requestCode(phone: string): Promise<void>
  /**
   * Verifies a code and signs in, returning the verified account id.
   *
   * The id is returned rather than only pushed into state because PIN recovery
   * has to check it against the shop's own account before trusting it.
   */
  verifyCode(phone: string, token: string): Promise<string>
  signOut(): Promise<void>
  /** Re-checks for a live session. Called when the device comes back online. */
  refresh(): Promise<void>
  dispose(): void
}

export function createAuthController(deps: AuthDeps = supabaseDeps()): AuthController {
  let state: AuthState = { status: 'checking' }
  const listeners = new Set<AuthListener>()

  function setState(next: AuthState): void {
    state = next
    listeners.forEach((listener) => listener(state))
  }

  function applySession(session: { userId: string } | null): void {
    if (session) {
      rememberUser(session.userId)
      setState({ status: 'signed_in', userId: session.userId })
      return
    }

    // A previously signed-in device with no usable session. Offline is the
    // common cause; an explicit sign-out clears the hint, so this does not
    // trap a user who meant to log out.
    const remembered = rememberedUser()
    setState(remembered ? { status: 'offline_stale', userId: remembered } : { status: 'signed_out' })
  }

  let unsubscribeAuth: (() => void) | null = null

  if (!deps.isConfigured()) {
    setState({ status: 'local_only' })
  } else {
    void deps
      .getSession()
      .then(applySession)
      .catch(() => applySession(null))
    unsubscribeAuth = deps.onAuthStateChange(applySession)
  }

  function requireE164(phone: string): string {
    if (!deps.isConfigured()) {
      throw new Error('Sync is not configured in this build, so codes cannot be sent.')
    }
    const e164 = toE164(phone)
    if (!e164) throw new Error('That phone number was not recognised. Check it and try again.')
    return e164
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },

    async requestCode(phone) {
      await deps.signInWithOtp(requireE164(phone), deps.channel)
    },

    async verifyCode(phone, token) {
      const { userId } = await deps.verifyOtp(requireE164(phone), token)
      applySession({ userId })
      return userId
    },

    async signOut() {
      forgetUser()
      if (deps.isConfigured()) await deps.signOut()
      setState({ status: 'signed_out' })
    },

    async refresh() {
      if (!deps.isConfigured()) return
      try {
        applySession(await deps.getSession())
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

/**
 * The real client. `verifyOtp`'s `type` is 'sms' for both channels -- the
 * channel picks how the code is delivered, not how it is checked.
 */
function supabaseDeps(): AuthDeps {
  const channel: CodeChannel =
    import.meta.env.VITE_CODE_CHANNEL === 'whatsapp' ? 'whatsapp' : 'sms'

  return {
    channel,
    isConfigured: isSupabaseConfigured,

    async getSession() {
      const { data } = await getSupabase().auth.getSession()
      return data.session?.user ? { userId: data.session.user.id } : null
    },

    onAuthStateChange(handler) {
      const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
        handler(session?.user ? { userId: session.user.id } : null)
      })
      return () => data.subscription.unsubscribe()
    },

    async signInWithOtp(e164, sendOn) {
      const { error } = await getSupabase().auth.signInWithOtp({
        phone: e164,
        options: { channel: sendOn },
      })
      if (error) throw error
    },

    async verifyOtp(e164, token) {
      const { data, error } = await getSupabase().auth.verifyOtp({
        phone: e164,
        token,
        type: 'sms',
      })
      if (error) throw error
      if (!data.session?.user) throw new Error('That code did not work. Ask for a new one.')
      return { userId: data.session.user.id }
    },

    async signOut() {
      // `local` scope: signing out here must not end the session on the shop's other phone.
      await getSupabase().auth.signOut({ scope: 'local' })
    },
  }
}
