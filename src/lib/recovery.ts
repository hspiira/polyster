/* What a forgotten PIN can offer. Proving identity needs a network; offline the
   only honest option is removing the shop, which destroys data but exposes none. */
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

/* Verifying a code proves you own that number, not that the number owns this
   shop. This is the check that closes the gap. */
export function verifiedUserOwnsShop(
  verifiedUserId: string,
  shopAuthUserId: string | undefined,
): boolean {
  if (!verifiedUserId || !shopAuthUserId) return false
  return verifiedUserId === shopAuthUserId
}
