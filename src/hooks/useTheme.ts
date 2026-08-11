import { useCallback, useState } from 'preact/hooks'
import { readPreference, savePreference, type ThemePreference } from '../lib/theme'

/**
 * The theme preference as state, so a control re-renders when it changes.
 *
 * lib/theme.ts writes the attribute on `<html>` directly, which React-style
 * state never sees. Without this a toggle applies the theme but keeps drawing
 * its old selection, which reads as a broken control.
 */
export function useTheme(): [ThemePreference, (next: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(readPreference)

  const choose = useCallback((next: ThemePreference) => {
    savePreference(next)
    setPreference(next)
  }, [])

  return [preference, choose]
}
