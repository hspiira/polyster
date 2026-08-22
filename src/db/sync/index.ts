/* One sync run: push, then pull. That order is load-bearing -- pulling first
   would overwrite a local edit with the server's older copy of it. */
import type { PolysterDatabase } from '../dexie/database'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { pullChanges, resetCursors, type PullReport, type Source } from './pull'
import { countPending, pushOutbox, type PushReport, type Remote } from './push'
import { supabaseRemote, supabaseSource } from './supabase'

export * from './order'
export * from './plan'
export { countPending, stuckEntries, type PushReport, type Remote } from './push'
export { resetCursors, type PullReport, type Source } from './pull'
export { supabaseRemote, supabaseSource } from './supabase'

export interface SyncResult {
  push: PushReport
  pull: PullReport
  /** Still owed after the run: a failed push, or work done while it ran. */
  pending: number
  at: string
}

export async function runSync(
  db: PolysterDatabase,
  remote: Remote = supabaseRemote(),
  source: Source = supabaseSource(),
): Promise<SyncResult> {
  const push = await pushOutbox(db, remote)
  const pull = await pullChanges(db, source)

  return { push, pull, pending: await countPending(db), at: new Date().toISOString() }
}

/** Whether a sync could run at all: an account to sync with, and a connection. */
export function canSync(online: boolean, signedIn: boolean): boolean {
  return online && signedIn && isSupabaseConfigured()
}

/* Takes everything again from the beginning. For a device whose local copy is
   suspect, and after a restore, where the cursors were cleared anyway. */
export async function resync(db: PolysterDatabase): Promise<SyncResult> {
  await resetCursors(db)
  return runSync(db)
}
