/**
 * Human-readable order reference, generated on the device so it works offline.
 * Indexed but not unique: a rejected replication push is worse than a rare
 * duplicate display code. See spec decision O8.
 */

/** Crockford base32, without I, L, O and U. */
export const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const SUFFIX_LENGTH = 5

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

export function generateOrderReference(now: Date = new Date()): string {
  const prefix = pad2(now.getUTCDate()) + pad2(now.getUTCMonth() + 1)

  const bytes = crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH))
  let suffix = ''
  for (const byte of bytes) suffix += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]

  return `${prefix}-${suffix}`
}
