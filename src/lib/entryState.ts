/**
 * Which screen the app shows before the shell.
 *
 * Pure and exhaustively tested because this is the one path every user takes,
 * and because deriving it from `auth.status` alone is what made `local_only`
 * and `offline_stale` skip the landing (spec E7).
 */
import type { AuthState } from './auth'

export type EntryScreen = 'splash' | 'fatal' | 'landing' | 'register' | 'lock' | 'shell'

export interface EntryInput {
  dbStatus: 'loading' | 'ready' | 'error'
  authStatus: AuthState['status']
  /** A shop row and at least one staff row exist locally. */
  provisioned: boolean
  locked: boolean
  /** The user chose "Set up my shop" and the form has not finished. */
  registering: boolean
  /**
   * True between a successful sign-in and the first replication pull settling.
   *
   * Without it a returning owner is shown the registration form during the gap,
   * because their shop has not arrived yet and "no local shop" is
   * indistinguishable from "no shop at all".
   */
  awaitingFirstPull: boolean
}

export function decideEntryScreen({
  dbStatus,
  authStatus,
  provisioned,
  locked,
  registering,
  awaitingFirstPull,
}: EntryInput): EntryScreen {
  if (dbStatus === 'error') return 'fatal'
  if (dbStatus === 'loading' || authStatus === 'checking') return 'splash'

  if (provisioned) return locked ? 'lock' : 'shell'
  if (registering) return 'register'
  if (authStatus === 'signed_in') return awaitingFirstPull ? 'splash' : 'register'

  return 'landing'
}

/**
 * A shop with no PIN on its staff row has not been locked yet, so it must not
 * be shown a pad it cannot answer.
 */
export function isLocked(staff: { pin_hash?: string }[], activeStaff: unknown): boolean {
  if (activeStaff) return false
  return staff.some((member) => Boolean(member.pin_hash))
}
