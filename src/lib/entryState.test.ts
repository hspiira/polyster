import { describe, expect, it } from 'vitest'
import { decideEntryScreen, isLocked, type EntryInput } from './entryState'

function input(over: Partial<EntryInput> = {}): EntryInput {
  return {
    dbStatus: 'ready',
    authStatus: 'signed_out',
    provisioned: false,
    claimed: false,
    locked: true,
    registering: false,
    awaitingFirstPull: false,
    ...over,
  }
}

describe('decideEntryScreen', () => {
  it('shows the splash while the database opens', () => {
    expect(decideEntryScreen(input({ dbStatus: 'loading' }))).toBe('splash')
  })

  it('shows the splash while auth is still being checked', () => {
    expect(decideEntryScreen(input({ authStatus: 'checking' }))).toBe('splash')
  })

  it('a database failure beats everything else', () => {
    expect(decideEntryScreen(input({ dbStatus: 'error', provisioned: true, locked: false }))).toBe(
      'fatal',
    )
  })

  // Local data decides, not the session.
  it('sends an unprovisioned device to the landing screen', () => {
    expect(decideEntryScreen(input({ provisioned: false }))).toBe('landing')
  })

  it('shows the form once the user has chosen to set up', () => {
    expect(decideEntryScreen(input({ registering: true }))).toBe('register')
  })

  it('opens the app the moment registration writes the shop and owner', () => {
    expect(
      decideEntryScreen(input({ registering: true, provisioned: true, locked: false })),
    ).toBe('shell')
  })

  it('locks a provisioned device', () => {
    expect(decideEntryScreen(input({ provisioned: true, locked: true }))).toBe('lock')
  })

  it('opens the app on a provisioned, unlocked device', () => {
    expect(decideEntryScreen(input({ provisioned: true, locked: false }))).toBe('shell')
  })

  // Regression: these two used to skip the landing entirely (finding F2).
  it.each(['local_only', 'offline_stale'] as const)(
    'still shows the landing to an unprovisioned %s device',
    (authStatus) => {
      expect(decideEntryScreen(input({ authStatus, provisioned: false }))).toBe('landing')
    },
  )

  // Regression: a lapsed session must not eject anyone to a sign-in screen.
  it('locks rather than landing when a provisioned device has gone stale', () => {
    expect(decideEntryScreen(input({ authStatus: 'offline_stale', provisioned: true }))).toBe(
      'lock',
    )
  })

  // A spent refresh token must not shut the till: the local database is intact,
  // so the shop keeps working while sync waits for someone to sign in again.
  it('opens the shell on a provisioned device whose session has expired', () => {
    expect(
      decideEntryScreen(input({ authStatus: 'session_expired', provisioned: true, locked: false })),
    ).toBe('shell')
  })

  it('closes a claimed shop when its account signs out', () => {
    expect(
      decideEntryScreen(
        input({ authStatus: 'signed_out', provisioned: true, claimed: true, locked: false }),
      ),
    ).toBe('landing')
  })

  it.each(['offline_stale', 'session_expired'] as const)(
    'keeps a claimed shop open when the server is unreachable (%s)',
    (authStatus) => {
      expect(
        decideEntryScreen(input({ authStatus, provisioned: true, claimed: true, locked: false })),
      ).toBe('shell')
    },
  )

  it('locks rather than landing when a provisioned device is signed out', () => {
    expect(decideEntryScreen(input({ authStatus: 'signed_out', provisioned: true }))).toBe('lock')
  })

  // A returning owner must not be shown the registration form while their shop
  // is still coming down the wire.
  it('waits on the splash after sign-in until the first pull settles', () => {
    expect(
      decideEntryScreen(input({ authStatus: 'signed_in', awaitingFirstPull: true })),
    ).toBe('splash')
  })

  it('registers a signed-in device once the pull brings nothing back', () => {
    expect(
      decideEntryScreen(input({ authStatus: 'signed_in', awaitingFirstPull: false })),
    ).toBe('register')
  })

  it('still reports a database failure while registering', () => {
    expect(decideEntryScreen(input({ registering: true, dbStatus: 'error' }))).toBe('fatal')
  })
})

describe('isLocked', () => {
  it('never locks a shop that has not set a PIN', () => {
    expect(isLocked([{ name: 'Ama' } as never], null)).toBe(false)
  })

  it('locks once a PIN exists and nobody is signed in for this session', () => {
    expect(isLocked([{ pin_hash: 'pbkdf2$...' }], null)).toBe(true)
  })

  it('does not lock while someone is active', () => {
    expect(isLocked([{ pin_hash: 'pbkdf2$...' }], { id: 'staff-1' })).toBe(false)
  })
})
