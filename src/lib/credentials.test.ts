import { describe, expect, it } from 'vitest'
import {
  MIN_PASSWORD_LENGTH,
  emailProblem,
  normaliseEmail,
  passwordProblem,
} from './credentials'

describe('normaliseEmail', () => {
  it('trims and lowercases, so the same address is one account', () => {
    expect(normaliseEmail('  Shop@Example.COM ')).toBe('shop@example.com')
  })
})

describe('emailProblem', () => {
  it('accepts an ordinary address', () => {
    expect(emailProblem('shop@example.com')).toBeNull()
  })

  it('accepts an address that only needs trimming', () => {
    expect(emailProblem(' shop@example.com ')).toBeNull()
  })

  it('asks for one when it is empty', () => {
    expect(emailProblem('   ')).toMatch(/enter the email/i)
  })

  it('rejects a missing @', () => {
    expect(emailProblem('shop.example.com')).toMatch(/email address/i)
  })

  it('rejects a missing domain dot', () => {
    expect(emailProblem('shop@example')).toMatch(/email address/i)
  })

  it('rejects embedded whitespace', () => {
    expect(emailProblem('sh op@example.com')).toMatch(/email address/i)
  })
})

describe('passwordProblem', () => {
  it('accepts a password at the minimum length', () => {
    expect(passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull()
  })

  it('asks for one when it is empty', () => {
    expect(passwordProblem('')).toMatch(/enter your password/i)
  })

  it('rejects one character short', () => {
    expect(passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(
      new RegExp(`${MIN_PASSWORD_LENGTH} characters`),
    )
  })

  // Spaces are legitimate password characters -- a passphrase should not be
  // rejected or silently trimmed the way the email is.
  it('does not trim a password', () => {
    expect(passwordProblem('  ' + 'a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull()
  })
})
