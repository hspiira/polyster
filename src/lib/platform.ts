/**
 * Which of the two designs this device gets.
 *
 * The app is not one layout that stretches. It is a web application and a phone
 * application that share a palette, a type scale and a domain, and share nothing
 * else -- see docs/superpowers/specs/2026-08-11-web-and-phone-split-design.md.
 * This module is the single place that decides which one mounts.
 *
 * ## Pointer, not width (decision W2)
 *
 * Width is a poor proxy for the thing that actually decides control size. A
 * 900px browser window is a desktop; a 1366px tablet held in two hands is not.
 * `(pointer: fine)` asks the question directly, because it reports the *primary*
 * input: a touchscreen laptop answers `fine` because its mouse is primary, which
 * is the answer we want.
 *
 * It is subscribed to rather than read once, so plugging a trackpad into a
 * tablet switches designs live.
 *
 * Deliberately mirrors lib/theme.ts: a pure `resolve`, storage that degrades
 * when blocked, and a watcher that re-reads the preference rather than closing
 * over it.
 */

export type Platform = 'web' | 'phone'
/** `auto` follows the pointer. The other two are the user overriding it. */
export type PlatformPreference = 'auto' | Platform

export const PLATFORM_STORAGE_KEY = 'polyster.platform'

const FINE_POINTER_QUERY = '(pointer: fine)'

function isPreference(value: unknown): value is PlatformPreference {
  return value === 'auto' || value === 'web' || value === 'phone'
}

/**
 * The whole decision, as a pure function of two booleans so it can be tested
 * without a DOM -- the same shape as lockPolicy.ts and entryState.ts.
 */
export function resolvePlatform({
  finePointer,
  preference = 'auto',
}: {
  finePointer: boolean
  preference?: PlatformPreference
}): Platform {
  if (preference !== 'auto') return preference
  return finePointer ? 'web' : 'phone'
}

/** Storage throws, not returns null, when blocked. Degrades to following the pointer. */
export function readPlatformPreference(): PlatformPreference {
  try {
    const stored = localStorage.getItem(PLATFORM_STORAGE_KEY)
    return isPreference(stored) ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

export function hasFinePointer(): boolean {
  return matchMedia(FINE_POINTER_QUERY).matches
}

/** The platform right now, from the stored preference and the live pointer. */
export function currentPlatform(): Platform {
  return resolvePlatform({
    finePointer: hasFinePointer(),
    preference: readPlatformPreference(),
  })
}

export function savePlatformPreference(preference: PlatformPreference): Platform {
  try {
    if (preference === 'auto') localStorage.removeItem(PLATFORM_STORAGE_KEY)
    else localStorage.setItem(PLATFORM_STORAGE_KEY, preference)
  } catch {
    // Not persisted, but it still applies for this session.
  }
  return currentPlatform()
}

/**
 * Calls back whenever the resolved platform changes -- a trackpad attached to a
 * tablet, or the preference being overridden. Fires only on an actual change,
 * because remounting a shell is not something to do on a spurious event.
 */
export function watchPlatform(onChange: (platform: Platform) => void): () => void {
  const query = matchMedia(FINE_POINTER_QUERY)
  let last = currentPlatform()

  const check = () => {
    const next = currentPlatform()
    if (next === last) return
    last = next
    onChange(next)
  }

  query.addEventListener('change', check)
  return () => query.removeEventListener('change', check)
}
