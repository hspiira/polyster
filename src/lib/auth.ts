/**
 * Shop-level authentication: email and password, or a social provider.
 * One Supabase account per shop. Staff PINs are a separate device unlock.
 *
 * Phone OTP (decision E1) is withdrawn: Supabase cannot enable phone auth
 * without a third-party SMS provider, and Twilio's Uganda rate is $0.3289 per
 * message behind a ~3 week sender-ID pre-registration. If a provider is bought
 * later, OTP returns as one more AuthDeps method.
 *
 * `offline_stale` exists because access tokens expire and refreshing needs a
 * network. A device that signed in before stays fully readable and writable
 * with replication stopped, rather than locking the till because a JWT aged
 * out overnight. RLS still gates every synced byte, so this leaks nothing.
 */
import { getSupabase, isSupabaseConfigured } from './supabaseClient'
import { emailProblem, normaliseEmail, passwordProblem } from './credentials'

const REMEMBERED_USER_KEY = 'tailor_tracker.last_shop_user_id'

export type AuthState =
  | { status: 'checking' }
  /** No Supabase credentials configured. Local-only, no sync, no sign-in. */
  | { status: 'local_only' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; userId: string }
  /** Signed in before, no live session reachable now. Local-only until online. */
  | { status: 'offline_stale'; userId: string }
  /**
   * Reached Supabase and it had no session for us -- the refresh token is spent.
   * Distinct from `offline_stale` because the fix is different: this one needs
   * signing in again, and telling someone that while they are merely offline
   * would be a lie. The till stays open either way.
   */
  | { status: 'session_expired'; userId: string }

export type AuthListener = (state: AuthState) => void

/**
 * Why we are looking at a session. Only a `refresh` -- which `useAuth` fires
 * exclusively when the device is online and reachable -- can conclude that a
 * missing session is expired rather than merely unreachable.
 */
type Cause = 'boot' | 'event' | 'refresh'

export type OAuthProvider = 'google'

/** Config, because there is no way to ask Supabase which providers a project enabled. */
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = (
  import.meta.env.VITE_OAUTH_PROVIDERS ?? ''
)
  .split(',')
  .map((name: string) => name.trim())
  .filter((name: string): name is OAuthProvider => name === 'google')

/** `confirm_email` means the project still has email confirmation on: user, no session. */
export type RegisterOutcome =
  | { status: 'signed_in'; userId: string }
  | { status: 'confirm_email' }

function rememberUser(userId: string): void {
  try {
    localStorage.setItem(REMEMBERED_USER_KEY, userId)
  } catch {
    // Losing the hint costs one extra sign-in.
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

export interface AuthDeps {
  isConfigured(): boolean
  getSession(): Promise<{ userId: string } | null>
  onAuthStateChange(handler: (session: { userId: string } | null) => void): () => void
  /** Resolves with a null id when the project requires email confirmation. */
  signUp(email: string, password: string): Promise<{ userId: string | null }>
  signIn(email: string, password: string): Promise<{ userId: string }>
  /** Navigates away. The session arrives on the trip back, not from this promise. */
  startOAuth(provider: OAuthProvider): Promise<void>
  sendPasswordReset(email: string): Promise<void>
  signOut(): Promise<void>
  canEmailRecover: boolean
  providers: readonly OAuthProvider[]
}

export interface AuthController {
  getState(): AuthState
  subscribe(listener: AuthListener): () => void
  register(email: string, password: string): Promise<RegisterOutcome>
  /** Returns the account id, which PIN recovery checks against the shop's own. */
  signIn(email: string, password: string): Promise<string>
  startOAuth(provider: OAuthProvider): Promise<void>
  sendPasswordReset(email: string): Promise<void>
  options(): { providers: readonly OAuthProvider[]; canEmailRecover: boolean }
  signOut(): Promise<void>
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

  function applySession(session: { userId: string } | null, cause: Cause): void {
    if (session) {
      rememberUser(session.userId)
      setState({ status: 'signed_in', userId: session.userId })
      return
    }

    const remembered = rememberedUser()
    if (!remembered) {
      setState({ status: 'signed_out' })
      return
    }
    setState({
      status: cause === 'refresh' ? 'session_expired' : 'offline_stale',
      userId: remembered,
    })
  }

  let unsubscribeAuth: (() => void) | null = null

  if (!deps.isConfigured()) {
    setState({ status: 'local_only' })
  } else {
    void deps
      .getSession()
      .then((session) => applySession(session, 'boot'))
      .catch(() => applySession(null, 'boot'))
    unsubscribeAuth = deps.onAuthStateChange((session) => applySession(session, 'event'))
  }

  function requireSync(): void {
    if (!deps.isConfigured()) {
      throw new Error('Sync is not configured in this build, so there is no account to use.')
    }
  }

  function requireCredentials(email: string, password: string): string {
    requireSync()
    const problem = emailProblem(email) ?? passwordProblem(password)
    if (problem) throw new Error(problem)
    return normaliseEmail(email)
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },

    async register(email, password) {
      const { userId } = await deps.signUp(requireCredentials(email, password), password)
      if (!userId) return { status: 'confirm_email' }
      applySession({ userId }, 'event')
      return { status: 'signed_in', userId }
    },

    async signIn(email, password) {
      const { userId } = await deps.signIn(requireCredentials(email, password), password)
      applySession({ userId }, 'event')
      return userId
    },

    async startOAuth(provider) {
      requireSync()
      await deps.startOAuth(provider)
    },

    async sendPasswordReset(email) {
      requireSync()
      const problem = emailProblem(email)
      if (problem) throw new Error(problem)
      await deps.sendPasswordReset(normaliseEmail(email))
    },

    options: () => ({ providers: deps.providers, canEmailRecover: deps.canEmailRecover }),

    async signOut() {
      forgetUser()
      if (deps.isConfigured()) await deps.signOut()
      setState({ status: 'signed_out' })
    },

    async refresh() {
      if (!deps.isConfigured()) return
      try {
        applySession(await deps.getSession(), 'refresh')
      } catch {
        // Could not reach Supabase, so nothing has been learned about whether
        // the session is still good. Stay soft rather than telling someone to
        // sign in again over a dropped request.
        applySession(null, 'boot')
      }
    },

    dispose() {
      unsubscribeAuth?.()
      listeners.clear()
    },
  }
}

/** The current path, so a redirect started from /settings comes back to /settings. */
function redirectTarget(): string {
  return `${window.location.origin}${window.location.pathname}`
}

function supabaseDeps(): AuthDeps {
  return {
    isConfigured: isSupabaseConfigured,
    providers: OAUTH_PROVIDERS,
    canEmailRecover: import.meta.env.VITE_EMAIL_RECOVERY === '1',

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

    async signUp(email, password) {
      const { data, error } = await getSupabase().auth.signUp({ email, password })
      if (error) throw error
      return { userId: data.session?.user?.id ?? null }
    },

    async signIn(email, password) {
      const { data, error } = await getSupabase().auth.signInWithPassword({ email, password })
      // One message for both failures: distinguishing them tells a stranger
      // which shops have accounts.
      if (error) throw new Error('That email and password do not match. Check both and try again.')
      if (!data.session?.user) throw new Error('Signing in did not complete. Try again.')
      return { userId: data.session.user.id }
    },

    async startOAuth(provider) {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirectTarget() },
      })
      if (error) throw error
    },

    async sendPasswordReset(email) {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: redirectTarget(),
      })
      if (error) throw error
    },

    async signOut() {
      // `local` scope: this must not end the session on the shop's other phone.
      await getSupabase().auth.signOut({ scope: 'local' })
    },
  }
}
