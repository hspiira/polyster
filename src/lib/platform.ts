/**
 * Which of the two designs this device gets.
 *
 * The app is not one layout that stretches. It is a web application and a phone
 * application that share a palette, a type scale and a domain, and share nothing
 * else -- see docs/superpowers/specs/2026-08-11-web-and-phone-split-design.md.
 *
 * ## Pointer, not width, and not a setting (decision W2)
 *
 * Width is a poor proxy for what decides control size. A 900px browser window is
 * a desktop; a 1366px tablet held in two hands is not. `(pointer: fine)` asks
 * the question directly, because it reports the *primary* input: a touchscreen
 * laptop answers `fine` because its mouse is primary.
 *
 * The device answers this, not the user. A layout picker asks someone to choose
 * between two things they have not seen, and every wrong answer is a person
 * using the wrong app on their hardware. It is subscribed to, so plugging a
 * trackpad into a tablet switches designs live.
 */

export type Platform = 'web' | 'phone'

const FINE_POINTER_QUERY = '(pointer: fine)'

/** Left behind by the layout picker this replaced. Cleared on boot. */
const LEGACY_STORAGE_KEY = 'polyster.platform'

/** Pure, so it can be tested without a DOM. */
export function resolvePlatform({ finePointer }: { finePointer: boolean }): Platform {
  return finePointer ? 'web' : 'phone'
}

export function hasFinePointer(): boolean {
  return matchMedia(FINE_POINTER_QUERY).matches
}

export function currentPlatform(): Platform {
  return resolvePlatform({ finePointer: hasFinePointer() })
}

/** Releases anyone pinned to the wrong layout by the old picker. */
export function forgetLayoutOverride(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Blocked storage has nothing stored to forget.
  }
}

/** Calls back when the pointer changes, e.g. a trackpad attached to a tablet. */
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
