import { describe, expect, it } from 'vitest'
import { CLAIM_REMINDER_DAYS, dismissalHolds } from './prompts'

const now = new Date('2026-08-14T09:00:00.000Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()

describe('dismissalHolds', () => {
  it('has nothing to hold when the ask was never dismissed', () => {
    expect(dismissalHolds(null, now, CLAIM_REMINDER_DAYS)).toBe(false)
  })

  it('holds while the window is still open', () => {
    expect(dismissalHolds(daysAgo(1), now, CLAIM_REMINDER_DAYS)).toBe(true)
    expect(dismissalHolds(daysAgo(6), now, CLAIM_REMINDER_DAYS)).toBe(true)
  })

  it('lapses once the window has passed, which is what brings the prompt back', () => {
    expect(dismissalHolds(daysAgo(7), now, CLAIM_REMINDER_DAYS)).toBe(false)
    expect(dismissalHolds(daysAgo(30), now, CLAIM_REMINDER_DAYS)).toBe(false)
  })

  it('asks again for the boolean an older build stored, rather than staying silent', () => {
    expect(dismissalHolds('1', now, CLAIM_REMINDER_DAYS)).toBe(false)
    expect(dismissalHolds('true', now, CLAIM_REMINDER_DAYS)).toBe(false)
    expect(dismissalHolds('', now, CLAIM_REMINDER_DAYS)).toBe(false)
  })

  it('ignores a dismissal stamped in the future, so clock skew cannot silence it', () => {
    expect(dismissalHolds(daysAgo(-2), now, CLAIM_REMINDER_DAYS)).toBe(false)
  })

  it('treats the boundary as lapsed, so the reminder is never a day late', () => {
    const exactly = new Date(now.getTime() - CLAIM_REMINDER_DAYS * 86_400_000).toISOString()
    expect(dismissalHolds(exactly, now, CLAIM_REMINDER_DAYS)).toBe(false)
  })
})
