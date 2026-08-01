import { describe, expect, it } from 'vitest'
import { generateOrderReference, REFERENCE_ALPHABET } from './orderReference'

describe('generateOrderReference', () => {
  it('is DDMM then five characters', () => {
    const ref = generateOrderReference(new Date('2026-08-12T09:00:00Z'))
    expect(ref).toMatch(/^1208-[0-9A-Z]{5}$/)
  })

  it('zero-pads single-digit days and months', () => {
    expect(generateOrderReference(new Date('2026-01-05T09:00:00Z')).slice(0, 4)).toBe('0501')
  })

  // Crockford base32: no I, L, O or U, so nothing is misread off a paper ticket.
  it('excludes the ambiguous letters', () => {
    expect(REFERENCE_ALPHABET).toHaveLength(32)
    for (const letter of ['I', 'L', 'O', 'U']) {
      expect(REFERENCE_ALPHABET).not.toContain(letter)
    }
  })

  it('uses only alphabet characters in the suffix', () => {
    for (let i = 0; i < 200; i++) {
      const suffix = generateOrderReference().slice(5)
      for (const char of suffix) expect(REFERENCE_ALPHABET).toContain(char)
    }
  })

  it('does not repeat within a reasonable sample', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(generateOrderReference())
    expect(seen.size).toBe(500)
  })
})
