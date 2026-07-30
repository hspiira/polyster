import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ITERATIONS,
  InvalidPinError,
  PIN_LENGTH,
  assertValidPin,
  hashPin,
  needsRehash,
  verifyPin,
} from './pin'

// PBKDF2 at the real iteration count is slow by design, which is the point of
// the whole module. A lower count keeps the suite fast while exercising
// identical code -- the parameters live in the hash string, so nothing about
// the logic changes with the number.
const FAST = 1_000

describe('assertValidPin', () => {
  it('is fixed at six digits', () => {
    expect(PIN_LENGTH).toBe(6)
  })

  it.each(['123456', '000000', '999999'])('accepts %s', (pin) => {
    expect(() => assertValidPin(pin)).not.toThrow()
  })

  it.each([
    ['1234', 'four digits, which used to be allowed'],
    ['12345', 'five digits'],
    ['1234567', 'seven digits'],
    ['12a456', 'not all digits'],
    ['', 'empty'],
    ['12 456', 'contains a space'],
  ])('rejects %s (%s)', (pin) => {
    expect(() => assertValidPin(pin)).toThrow(InvalidPinError)
  })
})

describe('hashPin / verifyPin', () => {
  it('accepts the correct PIN', async () => {
    const stored = await hashPin('123456', FAST)
    expect(await verifyPin('123456', stored)).toBe(true)
  })

  it('rejects a wrong PIN', async () => {
    const stored = await hashPin('123456', FAST)
    expect(await verifyPin('654321', stored)).toBe(false)
  })

  it('rejects a PIN that is a prefix of the right one', async () => {
    const stored = await hashPin('123456', FAST)
    expect(await verifyPin('1234', stored)).toBe(false)
  })

  it('produces a different hash each time for the same PIN', async () => {
    // Per-hash random salt. Without it, two staff sharing a PIN would be
    // visibly identical in the database, and one cracked hash would break
    // every reuse of that PIN across every shop.
    const a = await hashPin('123456', FAST)
    const b = await hashPin('123456', FAST)
    expect(a).not.toBe(b)
    expect(await verifyPin('123456', a)).toBe(true)
    expect(await verifyPin('123456', b)).toBe(true)
  })

  it('records its own parameters in the stored string', async () => {
    const stored = await hashPin('123456', FAST)
    const [algorithm, digest, iterations] = stored.split('$')
    expect(algorithm).toBe('pbkdf2')
    expect(digest).toBe('sha256')
    expect(Number(iterations)).toBe(FAST)
    expect(stored.split('$')).toHaveLength(5)
  })

  it('refuses to hash a PIN that is not valid', async () => {
    await expect(hashPin('1234', FAST)).rejects.toThrow(InvalidPinError)
  })

  it.each([
    ['', 'empty'],
    ['nonsense', 'not the format'],
    ['pbkdf2$sha256$1000$only-four-parts', 'truncated'],
    ['scrypt$sha256$1000$c2FsdA==$aGFzaA==', 'unknown algorithm'],
    ['pbkdf2$sha512$1000$c2FsdA==$aGFzaA==', 'unknown digest'],
    ['pbkdf2$sha256$zero$c2FsdA==$aGFzaA==', 'non-numeric iterations'],
    ['pbkdf2$sha256$0$c2FsdA==$aGFzaA==', 'zero iterations'],
  ])('returns false rather than throwing for a stored hash that is %s', async (stored) => {
    // A corrupt pin_hash on one staff row must lock out that one person, not
    // crash the picker for everyone on the device.
    await expect(verifyPin('123456', stored)).resolves.toBe(false)
  })

  it('returns false for a malformed PIN instead of throwing', async () => {
    const stored = await hashPin('123456', FAST)
    await expect(verifyPin('not-a-pin', stored)).resolves.toBe(false)
  })
})

describe('needsRehash', () => {
  it('flags a hash made with fewer iterations than current policy', async () => {
    const stored = await hashPin('123456', FAST)
    expect(needsRehash(stored)).toBe(true)
  })

  it('leaves a hash at current policy alone', async () => {
    const stored = await hashPin('123456', FAST)
    expect(needsRehash(stored, FAST)).toBe(false)
  })

  it('still verifies a hash that needs rehashing', async () => {
    // Raising the iteration count must not lock anyone out. The parameters
    // come from the stored string, not from current policy.
    const stored = await hashPin('123456', FAST)
    expect(needsRehash(stored, DEFAULT_ITERATIONS)).toBe(true)
    expect(await verifyPin('123456', stored)).toBe(true)
  })

  it('flags an unparseable hash for replacement', () => {
    expect(needsRehash('nonsense')).toBe(true)
  })
})
