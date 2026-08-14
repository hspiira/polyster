/* Which screen the app shows before the shell. Pure and exhaustively tested:
   deriving this from auth.status alone is what skipped the landing (spec E7). */
import type { AuthState } from './auth'

export type EntryScreen = 'splash' | 'fatal' | 'landing' | 'register' | 'lock' | 'shell'

export interface EntryInput {
  dbStatus: 'loading' | 'ready' | 'error'
  authStatus: AuthState['status']
  /** A shop row and at least one staff row exist locally. */
  provisioned: boolean
  /** The local shop carries a `supabase_auth_user_id`, so an account owns it. */
  claimed: boolean
  locked: boolean
  /** The user chose "Set up my shop" and the form has not finished. */
  registering: boolean
  /* True between sign-in and the first replication pull settling. Without it a
     returning owner sees the registration form while their shop is in flight. */
  awaitingFirstPull: boolean
}

export function decideEntryScreen({
  dbStatus,
  authStatus,
  provisioned,
  claimed,
  locked,
  registering,
  awaitingFirstPull,
}: EntryInput): EntryScreen {
  if (dbStatus === 'error') return 'fatal'
  if (dbStatus === 'loading' || authStatus === 'checking') return 'splash'

  // Not offline_stale/session_expired: those mean the server was unreachable.
  if (provisioned && claimed && authStatus === 'signed_out') return 'landing'

  if (provisioned) return locked ? 'lock' : 'shell'
  if (registering) return 'register'
  if (authStatus === 'signed_in') return awaitingFirstPull ? 'splash' : 'register'

  return 'landing'
}

/* A shop with no PIN on its staff row has not been locked yet, so it must not
   be shown a pad it cannot answer. */
export function isLocked(staff: { pin_hash?: string }[], activeStaff: unknown): boolean {
  if (activeStaff) return false
  return staff.some((member) => Boolean(member.pin_hash))
}
