import { useEffect, useState } from 'preact/hooks'
import type { Observable } from 'dexie'

/* Subscribes to a live query and re-renders on every change to the rows it
   touched. Pass `deps` the values the query is built from, not the query. */
export function useQuery<T>(build: () => Observable<T>, deps: readonly unknown[], initial: T): T {
  return useQueryStatus(build, deps, initial).value
}

/* As useQuery, plus whether it has emitted. Reading an unresolved query as
   empty is what reopened the first-run wizard on every cold start. */
export function useQueryStatus<T>(
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
      error: (error: unknown) => console.error('[db] query failed:', error),
    })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
