/**
 * The first-run steps, and which of them you are allowed to return to.
 *
 * Pure and tested for the same reason as entryState.ts: back is a gesture with
 * no label, so the rule about where it goes has to be stated somewhere it can
 * be checked rather than inferred from the order of `goTo` calls.
 */
export const SETUP_STEPS = ['phone', 'code', 'shop', 'pin', 'measure', 'install'] as const

export type SetupStep = (typeof SETUP_STEPS)[number]

/** The install epilogue is not part of creating a shop, so it is not a segment. */
export const COUNTED_SETUP_STEPS = 5

/**
 * Whether going back from `step` returns somewhere still safe to be.
 *
 * Only the two steps before anything is written say yes. Past that the shop
 * and its owner exist, and every earlier screen either creates a duplicate on
 * resubmit or re-asks for a code that has already been spent.
 */
export function stepAllowsBack(step: SetupStep): boolean {
  switch (step) {
    // Nothing behind it.
    case 'phone':
      return false
    // Change the number, or correct the shop's details. Nothing saved yet.
    case 'code':
    case 'shop':
      return true
    // The shop exists from here on.
    case 'pin':
    case 'measure':
    case 'install':
      return false
  }
}
