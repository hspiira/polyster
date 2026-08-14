/* Staff PIN hashing. Attribution, not a security boundary (D4) -- the hash
   exists so a leaked row does not leak reused digits. Rationale: ARCHITECTURE §9b. */

const ALGORITHM = 'pbkdf2'
const DIGEST = 'sha256'
const SALT_BYTES = 16
const DERIVED_BITS = 256

/** See the iteration-count discussion above. This wants measuring, not trusting. */
export const DEFAULT_ITERATIONS = 210_000

/* Fixed at six, not a range: it lets the pad submit itself on the last digit,
   and removes the four-digit option for the cost of two taps. */
export const PIN_LENGTH = 6

export class InvalidPinError extends Error {}

/* Exactly six digits. The entry UI is a number pad, so anything else means the
   value did not come from where it should have. */
export function assertValidPin(pin: string): void {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) {
    throw new InvalidPinError(`A PIN must be exactly ${PIN_LENGTH} digits.`)
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

/* Constant-time comparison. The timing channel is largely theoretical here, but
   the correct version is three lines longer than the incorrect one. */
function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return difference === 0
}

/* Returns false rather than throwing on a malformed stored hash: a corrupt
   pin_hash should lock out one person, not crash the picker for everybody. */
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

/* What a PIN check should cost on the slowest phone a shop uses: slow enough to
   be worth attacking through, fast enough that nobody waits. ARCHITECTURE §9b. */
export const TARGET_HASH_MS = 250

/* DEFAULT_ITERATIONS was measured on a desktop and extrapolated, which is not a
   measurement. This is how the number gets checked on the real hardware. */
export async function measureHashMs(iterations: number = DEFAULT_ITERATIONS): Promise<number> {
  const started = performance.now()
  await hashPin('000000', iterations)
  return performance.now() - started
}

/* PBKDF2 cost is linear in iterations, so one timing is enough to scale from.
   Rounded to ten thousand: a single sample does not justify more precision. */
export function recommendIterations(
  measuredMs: number,
  atIterations: number,
  targetMs: number = TARGET_HASH_MS,
): number {
  // Finite as well as positive: Infinity passes a `> 0` test and would then
  // scale the count to nothing.
  const sane = (n: number) => Number.isFinite(n) && n > 0
  if (!sane(measuredMs) || !sane(atIterations) || !sane(targetMs)) return atIterations
  const scaled = (atIterations * targetMs) / measuredMs
  return Math.max(10_000, Math.round(scaled / 10_000) * 10_000)
}

/* Whether a stored hash is behind current policy. The signal to re-hash next
   time the PIN is entered, the only moment the plaintext exists. */
export function needsRehash(stored: string, iterations: number = DEFAULT_ITERATIONS): boolean {
  const parsed = parse(stored)
  if (!parsed) return true
  return parsed.iterations < iterations
}
