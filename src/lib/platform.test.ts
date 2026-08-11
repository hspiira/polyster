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
  //
  // A user preference is absent for the same reason: the device knows, and a
  // picker only creates wrong answers to keep.
})
