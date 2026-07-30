import { describe, expect, it } from 'vitest'
import { recoveryPath, verifiedUserOwnsShop } from './recovery'

describe('recoveryPath', () => {
  it('offers verification when online and the shop has an account', () => {
    expect(recoveryPath({ online: true, shopAuthUserId: 'user-1' })).toBe('verify')
  })

  // An OTP needs a network, so there is nothing to verify against offline.
  it('offers only a destructive reset when offline', () => {
    expect(recoveryPath({ online: false, shopAuthUserId: 'user-1' })).toBe('reset_only')
  })

  // A shop created offline and never claimed has no account to check against,
  // so ownership cannot be proven even with a signal.
  it('offers only a destructive reset for an unclaimed shop', () => {
    expect(recoveryPath({ online: true, shopAuthUserId: undefined })).toBe('reset_only')
  })

  it('offers only a destructive reset when both are true', () => {
    expect(recoveryPath({ online: false, shopAuthUserId: undefined })).toBe('reset_only')
  })
})

describe('verifiedUserOwnsShop', () => {
  it('accepts the account the shop belongs to', () => {
    expect(verifiedUserOwnsShop('user-1', 'user-1')).toBe(true)
  })

  // Verifying your own number proves you own that number, not this shop.
  it('rejects a different account', () => {
    expect(verifiedUserOwnsShop('someone-else', 'user-1')).toBe(false)
  })

  it('rejects an unclaimed shop rather than treating it as a match', () => {
    expect(verifiedUserOwnsShop('user-1', undefined)).toBe(false)
  })

  it('rejects an empty verified id', () => {
    expect(verifiedUserOwnsShop('', '')).toBe(false)
  })
})
