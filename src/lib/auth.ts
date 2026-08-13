import { getSupabase, isSupabaseConfigured } from './supabaseClient'
import { emailProblem, normaliseEmail, passwordProblem } from './credentials'

/* Phone OTP is withdrawn: Supabase needs a third-party SMS provider, and
   Twilio's Uganda rate sits behind a ~3 week sender-ID pre-registration. */
const REMEMBERED_USER_KEY = 'tailor_tracker.last_shop_user_id'

export type AuthState =
  | { status: 'checking' }
  | { status: 'local_only' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; userId: string }
  | { status: 'offline_stale'; userId: string }
  | { status: 'session_expired'; userId: string }

export type AuthListener = (state: AuthState) => void

type Cause = 'boot' | 'event' | 'refresh'

export type OAuthProvider = 'google'

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = (
  import.meta.env.VITE_OAUTH_PROVIDERS ?? ''
)
  .split(',')
  .map((name: string) => name.trim())
  .filter((name: string): name is OAuthProvider => name === 'google')

export type RegisterOutcome =
  | { status: 'signed_in'; userId: string }
  | { status: 'confirm_email' }

function rememberUser(userId: string): void {
  try {
    localStorage.setItem(REMEMBERED_USER_KEY, userId)
  } catch {}
}

function forgetUser(): void {
  try {
    localStorage.removeItem(REMEMBERED_USER_KEY)
  } catch {}
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
  signUp(email: string, password: string): Promise<{ userId: string | null }>
  signIn(email: string, password: string): Promise<{ userId: string }>
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
        // Unreachable, so nothing has been learned. Do not call it expired.
        applySession(null, 'boot')
      }
    },

    dispose() {
      unsubscribeAuth?.()
      listeners.clear()
    },
  }
}

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
