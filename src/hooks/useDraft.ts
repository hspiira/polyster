import { useCallback, useReducer } from 'preact/hooks'

type Action<T> = { kind: 'set'; patch: Partial<T> } | { kind: 'reset'; value: T }

function reduce<T extends object>(state: T, action: Action<T>): T {
  return action.kind === 'reset' ? action.value : { ...state, ...action.patch }
}

export interface Draft<T extends object> {
  draft: T
  set: <K extends keyof T>(key: K, value: T[K]) => void
  patch: (patch: Partial<T>) => void
  reset: (value: T) => void
}

/** One reducer over a declared shape, instead of a useState per field. */
export function useDraft<T extends object>(initial: T | (() => T)): Draft<T> {
  const [draft, dispatch] = useReducer(
    reduce<T>,
    typeof initial === 'function' ? (initial as () => T)() : initial,
  )

  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    dispatch({ kind: 'set', patch: { [key]: value } as unknown as Partial<T> })
  }, [])

  const patch = useCallback((next: Partial<T>) => dispatch({ kind: 'set', patch: next }), [])
  const reset = useCallback((value: T) => dispatch({ kind: 'reset', value }), [])

  return { draft, set, patch, reset }
}
