/**
 * Choosing between the two designs by hand.
 *
 * Both shells render this, which is the point: a one-way door is worse than no
 * door. The first version of the override existed only as a "use the phone
 * design" button on a placeholder page, so anyone who pressed it was stuck on
 * the phone layout with no way back short of clearing site data.
 *
 * Three states, not a toggle. "Automatic" has to be reachable, because it is the
 * only one that keeps following the pointer -- pinning to `web` on a tablet and
 * forgetting is exactly how someone ends up wondering why a keyboard changed
 * nothing.
 *
 * Changing it reloads. The shells mount different routers over different DOM,
 * and a live swap is a re-entrancy problem worth avoiding for something done
 * once a device.
 */
import {
  readPlatformPreference,
  resolvePlatform,
  savePlatformPreference,
  hasFinePointer,
  type PlatformPreference,
} from '../lib/platform'

const OPTIONS: readonly { value: PlatformPreference; label: string; hint: string }[] = [
  { value: 'auto', label: 'Automatic', hint: 'Follows whether this device has a mouse' },
  { value: 'web', label: 'Desktop', hint: 'Dense tables, a sidebar, keyboard shortcuts' },
  { value: 'phone', label: 'Phone', hint: 'Large targets, one thing at a time' },
]

export function layoutOptions() {
  return OPTIONS
}

/** What "Automatic" would currently pick, for showing beside that option. */
export function automaticWouldPick(): 'web' | 'phone' {
  return resolvePlatform({ finePointer: hasFinePointer(), preference: 'auto' })
}

export function currentPreference(): PlatformPreference {
  return readPlatformPreference()
}

export function chooseLayout(preference: PlatformPreference): void {
  savePlatformPreference(preference)
  location.reload()
}
