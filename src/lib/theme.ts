/**
 * Theme selection: a `data-theme` attribute on `<html>`, which src/styles/
 * theme.css maps to every colour role. Nothing else in the app decides light
 * or dark.
 *
 * index.html carries an inline copy of `resolve()` that runs before the first
 * paint -- without it the app flashes the wrong theme on every launch. Keep the
 * two in step.
 */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/** Shared with the inline bootstrap in index.html. */
export const THEME_STORAGE_KEY = 'polyster.theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

/** Storage throws, not returns null, when blocked. Degrades to "follow system". */
export function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isPreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference
  return matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/**
 * Writes the resolved theme to `<html>` and syncs the status-bar colour. The
 * colour is read back out of the stylesheet, not hardcoded, so theme.css stays
 * the only file that decides.
 */
export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolve(preference)
  const root = document.documentElement
  root.dataset.theme = resolved

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    const colour = getComputedStyle(root).getPropertyValue('--meta-theme-color').trim()
    if (colour) meta.setAttribute('content', colour)
  }

  return resolved
}

export function savePreference(preference: ThemePreference): ResolvedTheme {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Preference is not persisted, but the theme still applies for this session.
  }
  return applyTheme(preference)
}

/**
 * Keeps a `system` preference live while the app is open. Re-reads the
 * preference on each change rather than closing over it, so a later
 * `savePreference('light')` correctly stops this doing anything.
 */
export function watchSystemTheme(): () => void {
  const query = matchMedia(DARK_QUERY)
  const onChange = () => {
    if (readPreference() === 'system') applyTheme('system')
  }
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Applies the stored preference and starts watching. Called once, from main. */
export function startTheme(): () => void {
  applyTheme(readPreference())
  return watchSystemTheme()
}
