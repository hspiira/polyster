import { useEffect, useState } from 'preact/hooks'
import type { Observable } from 'rxjs'

/* Re-renders on every change, local or replicated, so a screen never polls.
   Pass `deps` the values the query is built from, never the query object. */
export function useRxQuery<T>(build: () => Observable<T>, deps: readonly unknown[], initial: T): T {
  return useRxQueryStatus(build, deps, initial).value
}

/* As useRxQuery, plus whether it has emitted. Reading an unresolved query as
   empty is what reopened the first-run wizard on every cold start. */
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
