import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCK_AFTER_MINUTES, backoffMs, isLockedByIdle } from './lockPolicy'

const MIN = 60_000

describe('isLockedByIdle', () => {
  it('defaults to five minutes', () => {
    expect(DEFAULT_LOCK_AFTER_MINUTES).toBe(5)
  })

  it('does not lock an app that was never backgrounded', () => {
    expect(isLockedByIdle(null, 1_000_000, 5)).toBe(false)
  })

  it('does not lock before the timeout elapses', () => {
    expect(isLockedByIdle(0, 4 * MIN, 5)).toBe(false)
  })

  it('locks once the timeout elapses exactly', () => {
    expect(isLockedByIdle(0, 5 * MIN, 5)).toBe(true)
  })

  it('locks well past the timeout', () => {
    expect(isLockedByIdle(0, 90 * MIN, 5)).toBe(true)
  })

  it('never locks when the timeout is zero', () => {
    expect(isLockedByIdle(0, 10_000 * MIN, 0)).toBe(false)
  })

  // A device whose clock moved backwards must not be treated as "backgrounded
  // for negative time" and silently left unlocked forever.
  it('locks when the clock has gone backwards', () => {
    expect(isLockedByIdle(10 * MIN, 1 * MIN, 5)).toBe(true)
  })
})

describe('backoffMs', () => {
  it('does not delay the first attempts', () => {
    expect(backoffMs(0)).toBe(0)
    expect(backoffMs(4)).toBe(0)
  })

  it('starts delaying from the fifth failure', () => {
    expect(backoffMs(5)).toBe(1_000)
  })

  it('doubles with each further failure', () => {
    expect(backoffMs(6)).toBe(2_000)
    expect(backoffMs(7)).toBe(4_000)
  })

  // A shop must never be unable to open its own till, so this is a delay with
  // a ceiling, not a lockout.
  it('caps at thirty seconds', () => {
    expect(backoffMs(50)).toBe(30_000)
  })
})
