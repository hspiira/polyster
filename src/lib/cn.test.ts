import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('joins truthy parts with a single space', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsy parts so conditionals read inline', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })

  it('collapses the whitespace that multiline class strings introduce', () => {
    expect(cn('a\n   b', 'c')).toBe('a b c')
  })

  it('returns an empty string when everything is falsy', () => {
    expect(cn(false, null)).toBe('')
  })

  // Preact types a `class` prop as Signalish, so a non-string can reach here.
  // Dropping it beats stringifying it into "[object Object]".
  it('drops non-string values rather than stringifying them', () => {
    expect(cn('a', { value: 'b' }, 42, 'c')).toBe('a c')
  })
})
