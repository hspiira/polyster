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
export function useRxQuery<T>(build: () => Observable<T>, deps: readonly unknown[], initial: T): T {
  return useRxQueryStatus(build, deps, initial).value
}

/**
 * As `useRxQuery`, plus whether the query has emitted yet.
 *
 * Needed wherever "empty" and "not loaded" mean different things. Reading an
 * unresolved query as empty is what made the app open its first-run wizard on
 * every cold start, regardless of the shop already on the device.
 */
export function useRxQueryStatus<T>(
  build: () => Observable<T>,
  deps: readonly unknown[],
  initial: T,
): { value: T; loaded: boolean } {
  const [state, setState] = useState<{ value: T; loaded: boolean }>({
    value: initial,
    loaded: false,
  })

  useEffect(() => {
    const subscription = build().subscribe({
      next: (value) => setState({ value, loaded: true }),
      error: (err: unknown) => console.error('[rxdb] query failed:', err),
    })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
