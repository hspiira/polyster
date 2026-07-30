import { describe, expect, it } from 'vitest'
import { COUNTED_SETUP_STEPS, SETUP_STEPS, stepAllowsBack } from './setupSteps'

describe('stepAllowsBack', () => {
  it('refuses on the first step, which has nothing behind it', () => {
    expect(stepAllowsBack('phone')).toBe(false)
  })

  it('allows returning while nothing has been written yet', () => {
    expect(stepAllowsBack('code')).toBe(true)
    expect(stepAllowsBack('shop')).toBe(true)
  })

  // The bug this exists to prevent: resubmitting the shop step creates a
  // second shop, and the PIN step a second owner.
  it('refuses once the shop and its owner exist', () => {
    expect(stepAllowsBack('pin')).toBe(false)
    expect(stepAllowsBack('measure')).toBe(false)
    expect(stepAllowsBack('install')).toBe(false)
  })

  it('has an answer for every step', () => {
    for (const step of SETUP_STEPS) {
      expect(typeof stepAllowsBack(step)).toBe('boolean')
    }
  })
})

describe('SETUP_STEPS', () => {
  it('counts every step except the install epilogue towards progress', () => {
    expect(SETUP_STEPS).toHaveLength(COUNTED_SETUP_STEPS + 1)
    expect(SETUP_STEPS[SETUP_STEPS.length - 1]).toBe('install')
  })
})
