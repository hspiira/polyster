import { useEffect, useState } from 'preact/hooks'
import type { AppDatabase } from '../db/database'
import { startReplication, stopReplication } from '../db/replication'

/** How long a replication error must go unresolved before the UI says so. */
const ERROR_GRACE_MS = 4000

export type ReplicationStatus =
  | { status: 'idle' }
  | { status: 'syncing' }
  | { status: 'synced' }
  | { status: 'error'; error: unknown }

/**
 * Starts replication once the shop is authenticated and the database is open,
 * and stops it on sign-out. Replication must not start before auth: RLS has
 * nothing to scope the sync to, so it would quietly sync zero rows and look
 * like a broken connection (see db/replication.ts).
 *
 * A replication error is surfaced, never thrown. Sync failing is a normal
 * condition for this app -- the shop keeps working from the local database and
 * the UI shows that it is behind.
 */
export function useReplication(db: AppDatabase | null, authenticated: boolean): ReplicationStatus {
  const [status, setStatus] = useState<ReplicationStatus>({ status: 'idle' })

  useEffect(() => {
    if (!db || !authenticated) {
      setStatus({ status: 'idle' })
      return
    }

    let cancelled = false
    const handle = startReplication(db)
    if (!handle) {
      setStatus({ status: 'idle' })
      return
    }

    setStatus({ status: 'syncing' })
    // A push can fail for a reason that heals itself: order_units is scoped by
    // RLS through its parent order, and collections replicate independently, so
    // a unit can reach the server a moment before the order it belongs to. RxDB
    // retries and it lands. Reporting that instantly makes the badge cry wolf,
    // so an error has to still be unresolved a few seconds later to count.
    let pending: ReturnType<typeof setTimeout> | undefined
    const unsubscribeErrors = handle.onError((error) => {
      console.error('[replication]', error)
      if (cancelled || pending) return
      pending = setTimeout(() => {
        pending = undefined
        if (!cancelled) setStatus({ status: 'error', error })
      }, ERROR_GRACE_MS)
    })

    // Without this the first error latched: nothing ever moved the status off
    // 'error', so one failed batch left "Sync problem, saved locally" up for
    // the rest of the session while sync carried on working.
    const unsubscribeProgress = handle.onProgress(() => {
      clearTimeout(pending)
      pending = undefined
      if (!cancelled) setStatus({ status: 'synced' })
    })

    handle
      .awaitInitialReplication()
      .then(() => {
        if (!cancelled) setStatus({ status: 'synced' })
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus({ status: 'error', error })
      })

    return () => {
      cancelled = true
      clearTimeout(pending)
      unsubscribeErrors()
      unsubscribeProgress()
      void stopReplication()
    }
  }, [db, authenticated])

  return status
}
