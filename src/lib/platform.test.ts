import { describe, expect, it } from 'vitest'
import { resolvePlatform } from './platform'

describe('resolvePlatform', () => {
  it('gives a fine pointer the web design', () => {
    expect(resolvePlatform({ finePointer: true })).toBe('web')
  })

  it('gives a coarse pointer the phone design', () => {
    expect(resolvePlatform({ finePointer: false })).toBe('phone')
  })

  // Width is deliberately absent from the signature: a 900px browser window is
  // a desktop and a 1366px tablet is not, so width would answer a different
  // question than the one that decides control size (decision W2). There is no
  // test for that because there is no parameter to pass -- the type is the
  // assertion.

  describe('override', () => {
    it('forces the phone design on a fine pointer', () => {
      expect(resolvePlatform({ finePointer: true, preference: 'phone' })).toBe('phone')
    })

    it('forces the web design on a coarse pointer', () => {
      expect(resolvePlatform({ finePointer: false, preference: 'web' })).toBe('web')
    })

    it('agrees with detection when it happens to match', () => {
      expect(resolvePlatform({ finePointer: true, preference: 'web' })).toBe('web')
      expect(resolvePlatform({ finePointer: false, preference: 'phone' })).toBe('phone')
    })
  })

  describe('auto', () => {
    it('follows the pointer when set explicitly', () => {
      expect(resolvePlatform({ finePointer: true, preference: 'auto' })).toBe('web')
      expect(resolvePlatform({ finePointer: false, preference: 'auto' })).toBe('phone')
    })

    it('is what an omitted preference means', () => {
      expect(resolvePlatform({ finePointer: true })).toBe(
        resolvePlatform({ finePointer: true, preference: 'auto' }),
      )
    })
  })
})
