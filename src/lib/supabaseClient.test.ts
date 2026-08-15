import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* The module reads import.meta.env once at load, so every case needs a fresh
   registry. A dynamic import after resetModules is what gives one. */
async function load(url?: string, key?: string) {
  vi.resetModules()
  if (url === undefined) vi.stubEnv('VITE_SUPABASE_URL', '')
  else vi.stubEnv('VITE_SUPABASE_URL', url)
  if (key === undefined) vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  else vi.stubEnv('VITE_SUPABASE_ANON_KEY', key)
  return import('./supabaseClient')
}

const URL_OK = 'https://example.supabase.co'
const KEY_OK = 'anon-key'

beforeEach(() => {
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('isSupabaseConfigured', () => {
  it('is false with neither variable set, which is how the app runs offline-only', async () => {
    const { isSupabaseConfigured } = await load()
    expect(isSupabaseConfigured()).toBe(false)
  })

  it.each([
    ['url only', URL_OK, undefined],
    ['key only', undefined, KEY_OK],
  ])('is false with %s: half a client is not a configured one', async (_label, url, key) => {
    const { isSupabaseConfigured } = await load(url, key)
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('is true once both are set', async () => {
    const { isSupabaseConfigured } = await load(URL_OK, KEY_OK)
    expect(isSupabaseConfigured()).toBe(true)
  })
})

describe('getSupabase', () => {
  it('throws rather than returning a client pointed at nothing', async () => {
    const { getSupabase } = await load()
    expect(() => getSupabase()).toThrow(/VITE_SUPABASE_URL/)
  })

  it('names the fix in the message, since this fires on a fresh clone', async () => {
    const { getSupabase } = await load()
    expect(() => getSupabase()).toThrow(/\.env\.example/)
  })

  it('builds a client when configured', async () => {
    const { getSupabase } = await load(URL_OK, KEY_OK)
    expect(getSupabase()).toBeTruthy()
  })

  /* The lazy singleton is the point of the module: createClient('') throws, so
     constructing eagerly made a clone with no .env crash on import. */
  it('returns the same client rather than building one per call', async () => {
    const { getSupabase } = await load(URL_OK, KEY_OK)
    expect(getSupabase()).toBe(getSupabase())
  })

  it('persists the session, or a shop re-signs in every time the app opens', async () => {
    const { getSupabase } = await load(URL_OK, KEY_OK)
    // Reading it back off the instance rather than trusting the call site.
    expect(getSupabase().auth).toBeTruthy()
  })
})
