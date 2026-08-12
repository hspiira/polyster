import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthController, type AuthDeps } from './auth'

function fakeDeps(over: Partial<AuthDeps> = {}): AuthDeps {
  return {
    isConfigured: () => true,
    getSession: async () => null,
    onAuthStateChange: () => () => {},
    signUp: vi.fn(async () => ({ userId: 'user-1' })),
    signIn: vi.fn(async () => ({ userId: 'user-1' })),
    startOAuth: vi.fn(async () => {}),
    sendPasswordReset: vi.fn(async () => {}),
    signOut: async () => {},
    canEmailRecover: false,
    providers: [],
    ...over,
  }
}

/** The constructor kicks off an async getSession(); let it settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

const PASSWORD = 'shop-secret'

beforeEach(() => {
  localStorage.clear()
})

describe('createAuthController', () => {
  it('reports local_only when Supabase is not configured', () => {
    const auth = createAuthController(fakeDeps({ isConfigured: () => false }))
    expect(auth.getState().status).toBe('local_only')
  })

  it('refuses to sign in when Supabase is not configured', async () => {
    const auth = createAuthController(fakeDeps({ isConfigured: () => false }))
    await expect(auth.signIn('shop@example.com', PASSWORD)).rejects.toThrow(/not configured/i)
  })

  it('signs in and reports the account id', async () => {
    const auth = createAuthController(fakeDeps())
    await expect(auth.signIn('shop@example.com', PASSWORD)).resolves.toBe('user-1')
    expect(auth.getState()).toEqual({ status: 'signed_in', userId: 'user-1' })
  })

  it('normalises the email before signing in', async () => {
    const signIn = vi.fn(async () => ({ userId: 'user-1' }))
    const auth = createAuthController(fakeDeps({ signIn }))
    await auth.signIn('  Shop@Example.COM ', PASSWORD)
    expect(signIn).toHaveBeenCalledWith('shop@example.com', PASSWORD)
  })

  it('rejects a malformed email without calling out', async () => {
    const signIn = vi.fn(async () => ({ userId: 'user-1' }))
    const auth = createAuthController(fakeDeps({ signIn }))
    await expect(auth.signIn('not-an-email', PASSWORD)).rejects.toThrow(/email address/i)
    expect(signIn).not.toHaveBeenCalled()
  })

  // The form checks too, but the controller is the boundary that must hold.
  it('rejects a too-short password without calling out', async () => {
    const signIn = vi.fn(async () => ({ userId: 'user-1' }))
    const auth = createAuthController(fakeDeps({ signIn }))
    await expect(auth.signIn('shop@example.com', 'short')).rejects.toThrow(/characters/i)
    expect(signIn).not.toHaveBeenCalled()
  })

  it('signs in immediately when registration returns a session', async () => {
    const auth = createAuthController(fakeDeps())
    await expect(auth.register('shop@example.com', PASSWORD)).resolves.toEqual({
      status: 'signed_in',
      userId: 'user-1',
    })
    expect(auth.getState().status).toBe('signed_in')
  })

  // Email confirmation still on in the project: a user exists but no session
  // does, and saying "done" here would leave the shop signed out.
  it('reports confirm_email and stays signed out when registration returns no session', async () => {
    const auth = createAuthController(fakeDeps({ signUp: async () => ({ userId: null }) }))
    await expect(auth.register('shop@example.com', PASSWORD)).resolves.toEqual({
      status: 'confirm_email',
    })
    expect(auth.getState().status).not.toBe('signed_in')
  })

  it('remembers the user so a later cold start lands on offline_stale', async () => {
    const auth = createAuthController(fakeDeps())
    await auth.signIn('shop@example.com', PASSWORD)

    const next = createAuthController(fakeDeps())
    await settle()
    expect(next.getState()).toEqual({ status: 'offline_stale', userId: 'user-1' })
  })

  it('forgets the user on sign-out so the next start is signed_out', async () => {
    const auth = createAuthController(fakeDeps())
    await auth.signIn('shop@example.com', PASSWORD)
    await auth.signOut()
    expect(auth.getState().status).toBe('signed_out')

    const next = createAuthController(fakeDeps())
    await settle()
    expect(next.getState().status).toBe('signed_out')
  })

  it('starts a provider redirect', async () => {
    const startOAuth = vi.fn(async () => {})
    const auth = createAuthController(fakeDeps({ startOAuth }))
    await auth.startOAuth('google')
    expect(startOAuth).toHaveBeenCalledWith('google')
  })

  it('refuses a provider redirect when Supabase is not configured', async () => {
    const startOAuth = vi.fn(async () => {})
    const auth = createAuthController(fakeDeps({ isConfigured: () => false, startOAuth }))
    await expect(auth.startOAuth('google')).rejects.toThrow(/not configured/i)
    expect(startOAuth).not.toHaveBeenCalled()
  })

  // A reset needs no password, so it must not be gated behind one.
  it('sends a reset without requiring a password', async () => {
    const sendPasswordReset = vi.fn(async () => {})
    const auth = createAuthController(fakeDeps({ sendPasswordReset }))
    await auth.sendPasswordReset(' Shop@Example.com ')
    expect(sendPasswordReset).toHaveBeenCalledWith('shop@example.com')
  })

  it('rejects a reset for a malformed email', async () => {
    const sendPasswordReset = vi.fn(async () => {})
    const auth = createAuthController(fakeDeps({ sendPasswordReset }))
    await expect(auth.sendPasswordReset('nope')).rejects.toThrow(/email address/i)
    expect(sendPasswordReset).not.toHaveBeenCalled()
  })

  it('reports which doors the build can actually open', () => {
    const auth = createAuthController(fakeDeps({ providers: ['google'], canEmailRecover: true }))
    expect(auth.options()).toEqual({ providers: ['google'], canEmailRecover: true })
  })

  describe('session expiry', () => {
    async function signedInThen(over: Partial<AuthDeps>) {
      const auth = createAuthController(fakeDeps())
      await auth.signIn('shop@example.com', PASSWORD)
      const next = createAuthController(fakeDeps(over))
      await settle()
      return next
    }

    // Reached Supabase, it had nothing for us: the refresh token is spent and
    // only signing in again fixes it.
    it('reports session_expired when a refresh finds no session', async () => {
      const next = await signedInThen({ getSession: async () => null })
      await next.refresh()
      expect(next.getState()).toEqual({ status: 'session_expired', userId: 'user-1' })
    })

    // The distinction this state exists for: a dropped request teaches us
    // nothing, so it must not tell a shop to sign in again.
    it('stays offline_stale when a refresh cannot reach Supabase', async () => {
      const next = await signedInThen({
        getSession: async () => {
          throw new Error('network')
        },
      })
      await next.refresh()
      expect(next.getState()).toEqual({ status: 'offline_stale', userId: 'user-1' })
    })

    it('boots to offline_stale, not session_expired', async () => {
      const next = await signedInThen({ getSession: async () => null })
      expect(next.getState()).toEqual({ status: 'offline_stale', userId: 'user-1' })
    })

    it('recovers to signed_in when a later refresh finds a session', async () => {
      let session: { userId: string } | null = null
      const next = await signedInThen({ getSession: async () => session })
      await next.refresh()
      expect(next.getState().status).toBe('session_expired')

      session = { userId: 'user-1' }
      await next.refresh()
      expect(next.getState()).toEqual({ status: 'signed_in', userId: 'user-1' })
    })

    it('reports signed_out rather than expired with nobody remembered', async () => {
      const auth = createAuthController(fakeDeps({ getSession: async () => null }))
      await auth.refresh()
      expect(auth.getState().status).toBe('signed_out')
    })
  })

  it('notifies subscribers when the state changes', async () => {
    const auth = createAuthController(fakeDeps())
    const seen: string[] = []
    auth.subscribe((state) => seen.push(state.status))

    await auth.signIn('shop@example.com', PASSWORD)
    expect(seen).toContain('signed_in')
  })
})
