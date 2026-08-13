/* Order reference, generated on-device so it works offline. Indexed but not
   unique -- a rejected push is worse than a rare duplicate code (O8). */

/** Crockford base32, without I, L, O and U. */
export const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const SUFFIX_LENGTH = 5

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

export function generateOrderReference(now: Date = new Date()): string {
  // Use UTC intentionally (differs from dates.ts local-day convention). Order refs taken after local midnight show previous day's prefix.
  const prefix = pad2(now.getUTCDate()) + pad2(now.getUTCMonth() + 1)

  const bytes = crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH))
  let suffix = ''
  for (const byte of bytes) suffix += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]

  return `${prefix}-${suffix}`
}
