import { useEffect, useState } from 'preact/hooks'
import type { AppDatabase } from '../db/database'
import { startReplication, stopReplication } from '../db/replication'

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
    const unsubscribeErrors = handle.onError((error) => {
      console.error('[replication]', error)
      if (!cancelled) setStatus({ status: 'error', error })
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
      unsubscribeErrors()
      void stopReplication()
    }
  }, [db, authenticated])

  return status
}
