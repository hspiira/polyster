/* Runs sync and reports what it is doing. Never throws: sync failing is normal
   -- a shop in a building with no signal is the expected case, not an error. */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { PolysterDatabase } from '../db/dexie/database'
import { canSync, countPending, runSync } from '../db/sync'
import type { ReplicationStatus } from '../lib/syncState'

/** How long after a change to wait before pushing, so a burst is one round trip. */
const SETTLE_MS = 2500

/** How often to look for work the server has that this device does not. */
const PULL_EVERY_MS = 60_000

export interface SyncState extends Record<string, unknown> {
  status: ReplicationStatus
  /** Rows this device still owes the server. */
  pending: number
  /** Force a run now, for a button. */
  syncNow: () => void
}

export function useSync(
  db: PolysterDatabase | null,
  online: boolean,
  signedIn: boolean,
): SyncState {
  const [status, setStatus] = useState<ReplicationStatus>({ status: 'idle' })
  const [pending, setPending] = useState(0)
  const running = useRef(false)
  const [nudge, setNudge] = useState(0)

  const allowed = canSync(online, signedIn)

  const sync = useCallback(async () => {
    if (!db || !allowed || running.current) return
    running.current = true
    setStatus({ status: 'syncing' })

    try {
      const result = await runSync(db)
      setPending(result.pending)

      /* A failed push is not an error state on its own: the row is still here
         and will go next time. It only matters if nothing got through. */
      const stuck = result.push.failed.length > 0 && result.push.sent === 0
      setStatus(stuck ? { status: 'error', error: result.push.failed[0]?.error } : { status: 'synced' })
    } catch (error) {
      console.error('[sync]', error)
      setStatus({ status: 'error', error })
    } finally {
      running.current = false
    }
  }, [db, allowed])

  // What is owed, whether or not a sync can run. The badge shows this offline.
  useEffect(() => {
    if (!db) return
    let cancelled = false
    const read = () => {
      void countPending(db).then((count) => {
        if (!cancelled) setPending(count)
      })
    }
    read()
    const timer = setInterval(read, 5000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [db])

  // A burst of writes settles into one round trip rather than one each.
  useEffect(() => {
    if (!db || !allowed) {
      setStatus({ status: 'idle' })
      return
    }
    const timer = setTimeout(() => void sync(), pending > 0 ? SETTLE_MS : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, allowed, nudge, pending > 0])

  // The other device's work arrives on a timer; there is no push channel yet.
  useEffect(() => {
    if (!db || !allowed) return
    const timer = setInterval(() => void sync(), PULL_EVERY_MS)
    return () => clearInterval(timer)
  }, [db, allowed, sync])

  const syncNow = useCallback(() => setNudge((n) => n + 1), [])

  return { status, pending, syncNow }
}
