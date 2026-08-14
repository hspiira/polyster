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

/* Starts replication once authenticated, stops on sign-out. Errors are
   surfaced, never thrown: sync failing is normal and the shop keeps working. */
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
    // A push can fail and heal itself -- a unit can reach the server before its
    // order. So an error must still be unresolved seconds later to count.
    let pending: ReturnType<typeof setTimeout> | undefined
    const unsubscribeErrors = handle.onError((error) => {
      console.error('[replication]', error)
      if (cancelled || pending) return
      pending = setTimeout(() => {
        pending = undefined
        if (!cancelled) setStatus({ status: 'error', error })
      }, ERROR_GRACE_MS)
    })

    // Without this the first error latched, leaving "Sync problem" up for the
    // rest of the session while sync carried on working.
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
