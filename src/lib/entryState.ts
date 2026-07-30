/**
 * Which screen the app shows before the shell.
 *
 * Pure and exhaustively tested because this is the one path every user takes,
 * and because deriving it from `auth.status` alone is what made `local_only`
 * and `offline_stale` skip the landing (spec E7).
 */
import type { AuthState } from './auth'

export type EntryScreen = 'splash' | 'fatal' | 'landing' | 'setup' | 'lock' | 'shell'

export interface EntryInput {
  dbStatus: 'loading' | 'ready' | 'error'
  authStatus: AuthState['status']
  /** A shop row and at least one staff row exist locally. */
  provisioned: boolean
  locked: boolean
  /**
   * The wizard is running and has not said it has finished.
   *
   * Latched rather than derived: creating the shop and first staff member
   * makes `provisioned` true, and without this the wizard would be torn down
   * mid-flow, before its last steps could render.
   */
  setupStarted: boolean
}

export function decideEntryScreen({
  dbStatus,
  authStatus,
  provisioned,
  locked,
  setupStarted,
}: EntryInput): EntryScreen {
  if (dbStatus === 'error') return 'fatal'
  if (dbStatus === 'loading' || authStatus === 'checking') return 'splash'

  if (setupStarted) return 'setup'
  if (provisioned) return locked ? 'lock' : 'shell'

  // Verified but nothing set up yet: resume mid-setup rather than re-asking
  // for a number that has already been confirmed.
  return authStatus === 'signed_in' ? 'setup' : 'landing'
}
