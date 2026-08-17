import { useEffect } from 'preact/hooks'
import { forceTheme, type ResolvedTheme } from '../lib/theme'

/** Pins the document's theme for as long as the caller is mounted. */
export function useForcedTheme(theme: ResolvedTheme): void {
  useEffect(() => forceTheme(theme), [theme])
}
