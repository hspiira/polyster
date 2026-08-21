import { useEffect, useState } from 'preact/hooks'
import { getDatabase, type PolysterDatabase } from '../db/dexie/database'
import { runImport } from '../db/dexie/import'

export type DatabaseState =
  | { status: 'loading' }
  | { status: 'ready'; db: PolysterDatabase }
  | { status: 'error'; error: Error }

/* Opens the database and brings across anything left by an older version of
   the app. Every screen renders from this, never from a network call. */
export function useDatabase(): DatabaseState {
  const [state, setState] = useState<DatabaseState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const db = getDatabase()

    db.open()
      .then(() => runImport(db))
      .then((report) => {
        if (report.written > 0) console.info('[db] brought across', report.written, 'rows')
        if (!cancelled) setState({ status: 'ready', db })
      })
      .catch((error: unknown) => {
        console.error('[db] open failed:', error)
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
