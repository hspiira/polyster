import { describe, expect, it } from 'vitest'
import { decideEntryScreen, type EntryInput } from './entryState'

function input(over: Partial<EntryInput> = {}): EntryInput {
  return {
    dbStatus: 'ready',
    authStatus: 'signed_out',
    provisioned: false,
    locked: true,
    setupStarted: false,
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

  // The whole point of the redesign: local data decides, not the session.
  it('sends an unprovisioned device to the landing screen', () => {
    expect(decideEntryScreen(input({ provisioned: false }))).toBe('landing')
  })

  it('sends an unprovisioned but signed-in device straight to setup', () => {
    expect(decideEntryScreen(input({ provisioned: false, authStatus: 'signed_in' }))).toBe('setup')
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

  it('locks rather than landing when a provisioned device is signed out', () => {
    expect(decideEntryScreen(input({ authStatus: 'signed_out', provisioned: true }))).toBe('lock')
  })

  // Someone tapped through from the landing on a build that cannot send codes.
  it('shows setup once it has been started, even with nothing provisioned', () => {
    expect(decideEntryScreen(input({ setupStarted: true, provisioned: false }))).toBe('setup')
  })

  // The latch. Creating the owner makes `provisioned` true midway through, and
  // without this the wizard is torn down before its last steps can render.
  it('keeps setup up after the shop and staff exist, until it says it has finished', () => {
    expect(decideEntryScreen(input({ setupStarted: true, provisioned: true, locked: true }))).toBe(
      'setup',
    )
  })

  it('leaves setup for the app once it reports finished', () => {
    expect(
      decideEntryScreen(input({ setupStarted: false, provisioned: true, locked: false })),
    ).toBe('shell')
  })

  // A failure that must not be hidden behind a half-built wizard.
  it('still reports a database failure while setup is running', () => {
    expect(decideEntryScreen(input({ setupStarted: true, dbStatus: 'error' }))).toBe('fatal')
  })
})
