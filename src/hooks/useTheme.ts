import { useCallback, useState } from 'preact/hooks'
import { readPreference, savePreference, type ThemePreference } from '../lib/theme'

/* The theme preference as state. lib/theme.ts writes the attribute directly,
   which state never sees, so a toggle would keep drawing its old selection. */
export function useTheme(): [ThemePreference, (next: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(readPreference)

  const choose = useCallback((next: ThemePreference) => {
    savePreference(next)
    setPreference(next)
  }, [])

  return [preference, choose]
}
