/**
 * What a forgotten PIN can offer.
 *
 * Proving identity means signing in, which means a network. Offline -- or on a
 * shop created offline that was never backed up to an account -- there is
 * nothing to check ownership against, so the only honest option left is to
 * remove the shop from the device and set it up again.
 *
 * That escape hatch adds no risk: anyone holding the phone could uninstall the
 * PWA for the same effect. It destroys local data, it never exposes it.
 */
export type RecoveryPath =
  /** Sign in to the shop's account, then choose a new PIN. */
  | 'verify'
  /** Nothing can be proven here. Remove the shop and start again, or wait. */
  | 'reset_only'

export function recoveryPath(input: {
  online: boolean
  shopAuthUserId: string | undefined
}): RecoveryPath {
  return input.online && input.shopAuthUserId ? 'verify' : 'reset_only'
}

/**
 * Verifying a code proves you own that number -- not that the number owns this
 * shop. This is the check that closes the gap.
 */
export function verifiedUserOwnsShop(
  verifiedUserId: string,
  shopAuthUserId: string | undefined,
): boolean {
  if (!verifiedUserId || !shopAuthUserId) return false
  return verifiedUserId === shopAuthUserId
}
