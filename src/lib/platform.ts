/* Which of the two designs this device gets. Pointer, not width, and not a
   setting (W2): a 900px window is a desktop, a 1366px tablet is not. */

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
