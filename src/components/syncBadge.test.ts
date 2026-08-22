import { describe as group, expect, it } from 'vitest'
import { describe } from './SyncBadge'
import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../lib/syncState'

const signedIn: AuthState = { status: 'signed_in' } as AuthState
const localOnly: AuthState = { status: 'local_only' } as AuthState
const expired: AuthState = { status: 'session_expired' } as AuthState
const stale: AuthState = { status: 'offline_stale' } as AuthState

const idle: ReplicationStatus = { status: 'idle' }
const syncing: ReplicationStatus = { status: 'syncing' }
const synced: ReplicationStatus = { status: 'synced' }
const failed: ReplicationStatus = { status: 'error', error: new Error('no') }

group('what the badge says', () => {
  it('says local only when there is no account behind the shop', () => {
    expect(describe(true, localOnly, idle)).toEqual({ label: 'Local only', tone: 'neutral' })
  })

  it('says the shop is only on this phone when it has no account yet', () => {
    expect(describe(true, signedIn, idle, false).label).toBe('Only on this phone')
  })

  /* Needs a person to act, so it outranks every "we are just waiting" state --
     including being offline, which will resolve on its own. */
  it('puts an expired session above being offline', () => {
    expect(describe(false, expired, idle).label).toMatch(/Sign in again/)
    expect(describe(false, expired, idle).tone).toBe('bad')
  })

  it('says synced when everything is through', () => {
    expect(describe(true, signedIn, synced)).toEqual({ label: 'Synced', tone: 'good' })
  })

  it('says syncing while a run is going', () => {
    expect(describe(true, signedIn, syncing).tone).toBe('waiting')
  })
})

group('the count of what is not sent', () => {
  /* "Offline" alone does not say how much is at stake. A shop owner deciding
     whether to keep working needs the number. */
  it('says how much is waiting when offline', () => {
    expect(describe(false, signedIn, idle, true, 4).label).toBe('Offline, 4 changes not sent')
  })

  it('spells one out, because "1 change" reads as a typo', () => {
    expect(describe(false, signedIn, idle, true, 1).label).toBe('Offline, one change not sent')
  })

  it('says nothing about a count when there is nothing waiting', () => {
    expect(describe(false, signedIn, idle, true, 0).label).toBe('Offline')
  })

  /* The failure this guards: a green tick over a queue. Work done since the run
     finished has not reached the server, whatever the last run said. */
  it('does not claim synced while something is still owed', () => {
    const result = describe(true, signedIn, synced, true, 2)
    expect(result.label).toBe('Saved here, 2 changes not sent')
    expect(result.tone).toBe('waiting')
  })

  it('counts what is owed alongside a sync problem', () => {
    expect(describe(true, signedIn, failed, true, 3).label).toBe(
      'Sync problem, 3 changes not sent',
    )
  })

  it('counts what is owed when nothing is syncing at all', () => {
    expect(describe(true, signedIn, idle, true, 7).label).toBe('Not syncing, 7 changes not sent')
    expect(describe(true, signedIn, idle, true, 0).label).toBe('Not syncing')
  })

  it('counts what is owed when the session went stale offline', () => {
    expect(describe(false, stale, idle, true, 2).label).toMatch(/2 changes not sent/)
  })
})

group('tone', () => {
  it('is never good while something is owed', () => {
    for (const state of [idle, syncing, synced, failed]) {
      expect(describe(true, signedIn, state, true, 1).tone, state.status).not.toBe('good')
    }
  })

  it('is good only when synced with nothing owed', () => {
    expect(describe(true, signedIn, synced, true, 0).tone).toBe('good')
  })
})
