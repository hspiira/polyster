import { useEffect, useState } from 'preact/hooks'
import type { Observable } from 'rxjs'

/**
 * Subscribes to an RxDB query's observable and re-renders on every change,
 * whether the change came from this device or arrived via replication. This is
 * the whole reason the app reads through RxDB: a screen never polls and never
 * refetches, it just stays correct.
 *
 * `deps` controls when the subscription is rebuilt. Pass the values the query
 * is built from (an id, a search term), not the query object -- RxDB returns a
 * new query object on every call, so depending on it would resubscribe on
 * every render.
 */
export function useRxQuery<T>(
  build: () => Observable<T>,
  deps: readonly unknown[],
  initial: T,
): T {
  const [value, setValue] = useState<T>(initial)

  useEffect(() => {
    const subscription = build().subscribe({
      next: setValue,
      error: (err: unknown) => console.error('[rxdb] query failed:', err),
    })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return value
}
