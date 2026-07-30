import { describe, expect, it } from 'vitest'
import { DEFAULT_COUNTRY_CODE, formatPhoneForDisplay, toE164 } from './phone'

describe('toE164', () => {
  it('defaults to Uganda, matching the rest of the app', () => {
    expect(DEFAULT_COUNTRY_CODE).toBe('256')
  })

  it.each([
    ['0700000000', '+256700000000', 'national with a trunk zero'],
    ['+256700000000', '+256700000000', 'already international'],
    ['256700000000', '+256700000000', 'international without the plus'],
    ['+256 700 000 000', '+256700000000', 'spaced'],
    ['0700-000-000', '+256700000000', 'hyphenated'],
  ])('%s -> %s (%s)', (input, expected) => {
    expect(toE164(input)).toBe(expected)
  })

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['12345', 'too short to be a phone number'],
    ['700000000', 'ambiguous: no trunk zero, no country code'],
    ['not a number', 'not digits at all'],
  ])('returns null for %s (%s)', (input) => {
    expect(toE164(input)).toBeNull()
  })

  it('honours a different default country code', () => {
    expect(toE164('0712345678', '254')).toBe('+254712345678')
  })
})

describe('formatPhoneForDisplay', () => {
  it('groups the subscriber digits so a code screen can be checked at a glance', () => {
    expect(formatPhoneForDisplay('+256700000000')).toBe('+256 700 000 000')
  })

  it('returns anything it cannot group unchanged rather than mangling it', () => {
    expect(formatPhoneForDisplay('+1555')).toBe('+1555')
  })
})
