/**
 * Staff PIN hashing.
 *
 * ## What this is and is not protecting
 *
 * The PIN is an attribution check, not a security boundary (ARCHITECTURE.md
 * D4). Anyone holding the unlocked shop device can act as any staff member
 * whose PIN they know, and that is the accepted design.
 *
 * What the hash protects is narrower and real: `staff.pin_hash` replicates to
 * every device on the shop's account and sits in a Postgres row. Anyone who
 * reaches that row -- a stolen laptop still logged in, a mis-shared Supabase
 * password, a support session -- must not walk away with the PINs themselves,
 * because people reuse 4-digit numbers on phone locks and mobile money.
 *
 * ## Why a slow KDF for a 4-digit secret
 *
 * A 4-digit PIN is 10,000 candidates. Against a plain SHA-256 that is
 * exhausted faster than you can read this sentence. A deliberately slow KDF
 * does not make the keyspace bigger, but it turns an instant break into
 * something with a cost, and it costs the shop nothing: the PIN is verified
 * once when a staff member picks their name, not on every action.
 *
 * PBKDF2-HMAC-SHA256 via WebCrypto, because it is the only password KDF the
 * platform offers natively. Argon2id or scrypt would be better and both mean
 * shipping WASM to a low-bandwidth device -- not a trade worth making for a
 * secret that is explicitly not a security boundary.
 *
 * ## Iteration count
 *
 * OWASP's current guidance for PBKDF2-HMAC-SHA256 used for passwords is
 * 600,000 iterations. That figure is calibrated for server-side verification
 * on server hardware. This runs in a browser on whatever phone the shop owns,
 * and a staff picker that takes three seconds to accept a PIN will be worked
 * around rather than used.
 *
 * 210,000 is the compromise encoded below. Measured on the development
 * machine (Node 22, x64 desktop): 210,000 takes ~190ms, 600,000 takes ~490ms.
 * A low-end Android is commonly several times slower than a desktop at this,
 * which puts 210,000 somewhere around half a second to a second and a half on
 * the target hardware, and 600,000 well past the point where staff route
 * around the gate.
 *
 * **That extrapolation is not a measurement.** Time it on the lowest-end
 * Android the shop actually uses and adjust: target roughly 250ms there, and
 * raise the count if there is headroom. The count is stored inside every hash
 * string, so raising it later does not invalidate existing PINs -- `verifyPin`
 * reads the parameters from the stored hash, and `needsRehash` reports which
 * records are behind.
 *
 * I have not verified the 600,000 figure against OWASP's cheat sheet at the
 * time of writing; treat it as the number to check rather than a citation.
 *
 * ## Format
 *
 * `pbkdf2$sha256$<iterations>$<salt-b64>$<hash-b64>`
 *
 * Self-describing on purpose. Every parameter that might change is in the
 * string, so a future change is a migration of records rather than a flag day.
 */

const ALGORITHM = 'pbkdf2'
const DIGEST = 'sha256'
const SALT_BYTES = 16
const DERIVED_BITS = 256

/** See the iteration-count discussion above. This wants measuring, not trusting. */
export const DEFAULT_ITERATIONS = 210_000

export const MIN_PIN_LENGTH = 4
export const MAX_PIN_LENGTH = 6

export class InvalidPinError extends Error {}

/**
 * Digits only, 4-6 of them. Rejecting non-digits is not arbitrary strictness:
 * the PIN entry UI is a number pad, so anything else means the value did not
 * come from where it should have.
 */
export function assertValidPin(pin: string): void {
  if (!new RegExp(`^\\d{${MIN_PIN_LENGTH},${MAX_PIN_LENGTH}}$`).test(pin)) {
    throw new InvalidPinError(
      `A PIN must be ${MIN_PIN_LENGTH} to ${MAX_PIN_LENGTH} digits.`,
    )
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    DERIVED_BITS,
  )

  return new Uint8Array(bits)
}

/** Hashes a PIN for storage in `staff.pin_hash`. */
export async function hashPin(
  pin: string,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<string> {
  assertValidPin(pin)
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(pin, salt, iterations)
  return [ALGORITHM, DIGEST, iterations, toBase64(salt), toBase64(hash)].join('$')
}

interface ParsedHash {
  iterations: number
  salt: Uint8Array
  hash: Uint8Array
}

function parse(stored: string): ParsedHash | null {
  const parts = stored.split('$')
  if (parts.length !== 5) return null

  const [algorithm, digest, iterationsRaw, saltRaw, hashRaw] = parts
  if (algorithm !== ALGORITHM || digest !== DIGEST) return null
  if (!iterationsRaw || !saltRaw || !hashRaw) return null

  const iterations = Number(iterationsRaw)
  if (!Number.isInteger(iterations) || iterations < 1) return null

  try {
    return { iterations, salt: fromBase64(saltRaw), hash: fromBase64(hashRaw) }
  } catch {
    return null
  }
}

/**
 * Constant-time comparison. The timing channel here is largely theoretical --
 * the attacker would need to be running in this browser -- but the correct
 * version is three lines longer than the incorrect one.
 */
function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return difference === 0
}

/**
 * Checks a PIN against a stored hash.
 *
 * Returns false rather than throwing for a malformed or unrecognised stored
 * hash. A corrupt `pin_hash` on one staff row should lock out that one person,
 * not crash the picker for everybody on the device.
 */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parsed = parse(stored)
  if (!parsed) return false

  try {
    assertValidPin(pin)
  } catch {
    return false
  }

  const candidate = await derive(pin, parsed.salt, parsed.iterations)
  return equals(candidate, parsed.hash)
}

/**
 * Whether a stored hash was made with weaker parameters than current policy.
 * Verification still succeeds; this is the signal to re-hash the PIN next time
 * the staff member enters it, which is the only moment the plaintext exists.
 */
export function needsRehash(stored: string, iterations: number = DEFAULT_ITERATIONS): boolean {
  const parsed = parse(stored)
  if (!parsed) return true
  return parsed.iterations < iterations
}
