import { describe, expect, it } from 'vitest'
import { formatMinor } from './money'
import {
  outstandingMinor,
  paymentDateError,
  paymentError,
  toPaymentTimestamp,
  type PaymentCheck,
} from './payments'

// Intl puts a non-breaking space after the symbol, so the amounts in these
// expectations are built rather than retyped.
const ugx = (minor: number) => formatMinor(minor, 'UGX')

function check(over: Partial<PaymentCheck> = {}): PaymentCheck {
  return {
    priceTotalMinor: 100_000,
    amountPaidMinor: 0,
    amountMinor: 10_000,
    kind: 'payment',
    currency: 'UGX',
    ...over,
  }
}

describe('outstandingMinor', () => {
  it('is what is left to pay', () => {
    expect(outstandingMinor(100_000, 40_000)).toBe(60_000)
  })

  it('floors at zero, so an overpaid order owes nothing', () => {
    expect(outstandingMinor(100_000, 130_000)).toBe(0)
  })
})

describe('paymentDateError', () => {
  it('accepts today', () => {
    expect(paymentDateError('2026-08-13', '2026-08-13')).toBeNull()
  })

  it('accepts a backdated payment', () => {
    expect(paymentDateError('2026-07-02', '2026-08-13')).toBeNull()
  })

  it('refuses a future date', () => {
    expect(paymentDateError('2026-08-14', '2026-08-13')).toBe(
      'A payment cannot be dated in the future.',
    )
  })

  it('refuses an empty date', () => {
    expect(paymentDateError('', '2026-08-13')).toBe('Choose the date this money was taken.')
  })
})

describe('toPaymentTimestamp', () => {
  const nowIso = '2026-08-13T09:30:00.000Z'

  it('keeps the real time when the date is today', () => {
    expect(toPaymentTimestamp('2026-08-13', nowIso, '2026-08-13')).toBe(nowIso)
  })

  it('keeps the real time when no date is given', () => {
    expect(toPaymentTimestamp(undefined, nowIso, '2026-08-13')).toBe(nowIso)
  })

  // Noon local, so the stored date reads the same either side of UTC.
  it('stamps a backdated payment at midday on the chosen day', () => {
    const stamped = toPaymentTimestamp('2026-07-02', nowIso, '2026-08-13')
    const local = new Date(stamped)
    expect(local.getFullYear()).toBe(2026)
    expect(local.getMonth()).toBe(6)
    expect(local.getDate()).toBe(2)
    expect(local.getHours()).toBe(12)
  })
})

describe('paymentError', () => {
  it('accepts a part payment', () => {
    expect(paymentError(check({ amountMinor: 40_000 }))).toBeNull()
  })

  it('accepts a payment that settles the order exactly', () => {
    expect(paymentError(check({ amountPaidMinor: 60_000, amountMinor: 40_000 }))).toBeNull()
  })

  it.each([0, -1, NaN])('rejects an amount of %s', (amountMinor) => {
    expect(paymentError(check({ amountMinor }))).toBe('Enter an amount greater than zero.')
  })

  // The bug: instalments could add up past the price.
  it('rejects a payment that would take the total past the price', () => {
    expect(paymentError(check({ amountPaidMinor: 60_000, amountMinor: 40_001 }))).toBe(
      `That is more than the ${ugx(40_000)} still owed.`,
    )
  })

  // The other half of the bug: a settled order could still take money.
  it('rejects any payment on a settled order', () => {
    expect(paymentError(check({ amountPaidMinor: 100_000, amountMinor: 1 }))).toBe(
      'This order is fully paid. Nothing more is owed on it.',
    )
  })

  it('rejects a payment on an already overpaid order', () => {
    expect(paymentError(check({ amountPaidMinor: 130_000, amountMinor: 1 }))).toBe(
      'This order is fully paid. Nothing more is owed on it.',
    )
  })

  it('says what to do when the order has no price yet', () => {
    expect(paymentError(check({ priceTotalMinor: 0 }))).toBe(
      'Add what this order is for before taking money against it.',
    )
  })

  describe('refunds', () => {
    it('allows a refund up to what was taken, settled order or not', () => {
      expect(
        paymentError(check({ kind: 'refund', amountPaidMinor: 100_000, amountMinor: 100_000 })),
      ).toBeNull()
    })

    it('refuses to refund more than was taken', () => {
      expect(
        paymentError(check({ kind: 'refund', amountPaidMinor: 40_000, amountMinor: 40_001 })),
      ).toBe(`You can only refund up to ${ugx(40_000)}.`)
    })

    it('refuses a refund when nothing has been paid', () => {
      expect(paymentError(check({ kind: 'refund', amountPaidMinor: 0 }))).toBe(
        'Nothing has been paid on this order yet.',
      )
    })
  })
})
