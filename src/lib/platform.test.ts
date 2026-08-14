import { describe, expect, it } from 'vitest'
import { resolvePlatform } from './platform'

describe('resolvePlatform', () => {
  it('gives a fine pointer the web design', () => {
    expect(resolvePlatform({ finePointer: true })).toBe('web')
  })

  it('gives a coarse pointer the phone design', () => {
    expect(resolvePlatform({ finePointer: false })).toBe('phone')
  })

  // Width is absent from the signature on purpose (W2), and so is a user
  // preference. There is no test because there is no parameter to pass.
})
