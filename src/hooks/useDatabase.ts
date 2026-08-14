import { useEffect, useState } from 'preact/hooks'
import { getDatabase, type AppDatabase } from '../db/database'

export type DatabaseState =
  | { status: 'loading' }
  | { status: 'ready'; db: AppDatabase }
  | { status: 'error'; error: Error }

/* The shared RxDB instance. Every screen renders from this, never from a
   network call (ARCHITECTURE §3). */
export function useDatabase(): DatabaseState {
  const [state, setState] = useState<DatabaseState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    getDatabase()
      .then((db) => {
        if (!cancelled) setState({ status: 'ready', db })
      })
      .catch((error: unknown) => {
        console.error('[db] RxDB init failed:', error)
        if (!cancelled) {
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
