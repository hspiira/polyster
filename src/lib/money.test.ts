import { describe, expect, it } from 'vitest'
import {
  currencyExponent,
  toMinorUnits,
  fromMinorUnits,
  formatMinor,
  parseToMinor,
} from './money'

describe('minor units', () => {
  // If this fails, ICU on this platform disagrees with ISO 4217 for UGX and
  // currencyExponent needs the explicit fallback map. See spec section 9.
  it('reports UGX as a zero-decimal currency and KES as two', () => {
    expect(currencyExponent('UGX')).toBe(0)
    expect(currencyExponent('KES')).toBe(2)
  })

  it('round-trips through minor units at both exponents', () => {
    expect(toMinorUnits(45000, 'UGX')).toBe(45000)
    expect(fromMinorUnits(45000, 'UGX')).toBe(45000)
    expect(toMinorUnits(45000, 'KES')).toBe(4500000)
    expect(fromMinorUnits(4500000, 'KES')).toBe(45000)
  })

  it('rounds to the currency, never leaving a fraction of a minor unit', () => {
    expect(toMinorUnits(45000.6, 'UGX')).toBe(45001)
    expect(toMinorUnits(45.005, 'KES')).toBe(4501)
  })

  it('parses what a shop owner types, in minor units', () => {
    expect(parseToMinor('45,000', 'UGX')).toBe(45000)
    expect(parseToMinor(' 45 000 ', 'UGX')).toBe(45000)
    expect(parseToMinor('45.50', 'KES')).toBe(4550)
    expect(parseToMinor('', 'UGX')).toBeNull()
    expect(parseToMinor('-1', 'UGX')).toBeNull()
    expect(parseToMinor('abc', 'UGX')).toBeNull()
  })

  it('formats from minor units', () => {
    expect(formatMinor(45000, 'UGX')).toContain('45,000')
  })
})
