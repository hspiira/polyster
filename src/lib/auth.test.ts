import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthController, type AuthDeps } from './auth'

function fakeDeps(over: Partial<AuthDeps> = {}): AuthDeps {
  return {
    isConfigured: () => true,
    getSession: async () => null,
    onAuthStateChange: () => () => {},
    signInWithOtp: vi.fn(async () => {}),
    verifyOtp: vi.fn(async () => ({ userId: 'user-1' })),
    signOut: async () => {},
    channel: 'sms',
    ...over,
  }
}

/** The constructor kicks off an async getSession(); let it settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  localStorage.clear()
})

describe('createAuthController', () => {
  it('reports local_only when Supabase is not configured', () => {
    const auth = createAuthController(fakeDeps({ isConfigured: () => false }))
    expect(auth.getState().status).toBe('local_only')
  })

  it('refuses to send a code when Supabase is not configured', async () => {
    const auth = createAuthController(fakeDeps({ isConfigured: () => false }))
    await expect(auth.requestCode('0700000000')).rejects.toThrow(/not configured/i)
  })

  it('normalises the number before sending a code', async () => {
    const signInWithOtp = vi.fn(async () => {})
    const auth = createAuthController(fakeDeps({ signInWithOtp }))
    await auth.requestCode('0700 000 000')
    expect(signInWithOtp).toHaveBeenCalledWith('+256700000000', 'sms')
  })

  it('rejects a number it cannot make sense of, without calling out', async () => {
    const signInWithOtp = vi.fn(async () => {})
    const auth = createAuthController(fakeDeps({ signInWithOtp }))
    await expect(auth.requestCode('12345')).rejects.toThrow(/phone number/i)
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('signs in once a code verifies', async () => {
    const auth = createAuthController(fakeDeps())
    await auth.verifyCode('0700000000', '123456')
    expect(auth.getState()).toEqual({ status: 'signed_in', userId: 'user-1' })
  })

  // PIN recovery needs this to check the number against the shop's own account.
  it('returns the verified account id', async () => {
    const auth = createAuthController(fakeDeps())
    await expect(auth.verifyCode('0700000000', '123456')).resolves.toBe('user-1')
  })

  it('normalises the number when verifying too', async () => {
    const verifyOtp = vi.fn(async () => ({ userId: 'user-1' }))
    const auth = createAuthController(fakeDeps({ verifyOtp }))
    await auth.verifyCode('0700 000 000', '123456')
    expect(verifyOtp).toHaveBeenCalledWith('+256700000000', '123456')
  })

  it('remembers the user so a later cold start lands on offline_stale', async () => {
    const auth = createAuthController(fakeDeps())
    await auth.verifyCode('0700000000', '123456')

    const next = createAuthController(fakeDeps())
    await settle()
    expect(next.getState()).toEqual({ status: 'offline_stale', userId: 'user-1' })
  })

  it('forgets the user on sign-out so the next start is signed_out', async () => {
    const auth = createAuthController(fakeDeps())
    await auth.verifyCode('0700000000', '123456')
    await auth.signOut()
    expect(auth.getState().status).toBe('signed_out')

    const next = createAuthController(fakeDeps())
    await settle()
    expect(next.getState().status).toBe('signed_out')
  })

  it('sends the code over the configured channel', async () => {
    const signInWithOtp = vi.fn(async () => {})
    const auth = createAuthController(fakeDeps({ signInWithOtp, channel: 'whatsapp' }))
    await auth.requestCode('0700000000')
    expect(signInWithOtp).toHaveBeenCalledWith('+256700000000', 'whatsapp')
  })

  it('notifies subscribers when the state changes', async () => {
    const auth = createAuthController(fakeDeps())
    const seen: string[] = []
    auth.subscribe((state) => seen.push(state.status))

    await auth.verifyCode('0700000000', '123456')
    expect(seen).toContain('signed_in')
  })
})
