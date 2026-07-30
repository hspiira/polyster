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
