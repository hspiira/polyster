import { describe, expect, it } from 'vitest'
import { formatMoney, parseMoney } from './money'

describe('formatMoney', () => {
  it('formats a whole amount without trailing decimals', () => {
    // A shop's prices are round numbers. Showing "UGX 250,000.00" on every row
    // makes a list harder to scan for nothing.
    expect(formatMoney(250000)).not.toMatch(/\.00$/)
    expect(formatMoney(250000)).toContain('250,000')
  })

  it('keeps decimals when an amount actually has them', () => {
    expect(formatMoney(99.5)).toContain('99.5')
  })

  it('formats zero', () => {
    expect(formatMoney(0)).toContain('0')
  })
})

describe('parseMoney', () => {
  it('accepts a plain number', () => {
    expect(parseMoney('250000')).toBe(250000)
  })

  it('accepts thousands separators and spaces', () => {
    // Someone typing what they see on a price list should not be told it is
    // invalid.
    expect(parseMoney('250,000')).toBe(250000)
    expect(parseMoney(' 1 200 ')).toBe(1200)
  })

  it('rounds to two places so long decimals cannot enter the database', () => {
    expect(parseMoney('33.333333')).toBe(33.33)
  })

  it('accepts zero', () => {
    expect(parseMoney('0')).toBe(0)
  })

  it.each([
    ['', 'empty'],
    ['abc', 'not a number'],
    ['-5', 'negative'],
    ['1e999', 'not finite'],
  ])('returns null for %s (%s)', (input) => {
    expect(parseMoney(input)).toBeNull()
  })
})

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
