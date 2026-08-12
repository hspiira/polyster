import { describe, expect, it } from 'vitest'
import { suggestedMessage, toWaNumber, waLink } from './whatsapp'
import type { OrderBalance } from '../db/balances'

describe('toWaNumber', () => {
  it('accepts an international number and strips the plus', () => {
    expect(toWaNumber('+256700123456')).toBe('256700123456')
  })

  it('tolerates spaces, dashes and brackets', () => {
    expect(toWaNumber('+256 (700) 123-456')).toBe('256700123456')
  })

  it('swaps a national trunk zero for the country code', () => {
    expect(toWaNumber('0700123456')).toBe('256700123456')
  })

  it('leaves a number that already carries the country code alone', () => {
    expect(toWaNumber('256700123456')).toBe('256700123456')
  })

  it('honours a different default country code', () => {
    expect(toWaNumber('0700123456', '254')).toBe('254700123456')
  })

  it.each<[string | undefined, string]>([
    [undefined, 'missing'],
    ['', 'empty'],
    ['12345', 'too short to be a phone number'],
    ['447700900000', 'a foreign number with no plus and no known prefix'],
  ])('returns null for %s (%s)', (phone) => {
    // Guessing here does not fail loudly, it opens a chat with a stranger.
    // A disabled button is the better outcome.
    expect(toWaNumber(phone)).toBeNull()
  })
})

describe('waLink', () => {
  it('builds a wa.me URL with the message encoded', () => {
    const link = waLink('+256700123456', 'Your suit is ready & paid')
    expect(link).toBe('https://wa.me/256700123456?text=Your%20suit%20is%20ready%20%26%20paid')
  })

  it('returns null when the number cannot be trusted', () => {
    expect(waLink('12345', 'hello')).toBeNull()
  })
})

describe('suggestedMessage', () => {
  const base = {
    shopName: 'Kampala Tailors',
    clientName: 'Amina',
    order: {
      currency: 'UGX',
      summary: 'navy two-piece suit',
      stage: 'ready' as const,
      pickup_due_date: '2026-08-14',
    },
  }

  const owing: OrderBalance = {
    order_id: 'o1',
    price_total_minor: 250000,
    amount_paid_minor: 100000,
    balance_minor: 150000,
    fully_paid: false,
  }

  const settled: OrderBalance = {
    order_id: 'o1',
    price_total_minor: 250000,
    amount_paid_minor: 250000,
    balance_minor: 0,
    fully_paid: true,
  }

  it('mentions the outstanding balance when there is one', () => {
    const message = suggestedMessage({ ...base, balance: owing })
    expect(message).toContain('Amina')
    expect(message).toContain('navy two-piece suit')
    expect(message).toContain('150,000')
  })

  it('says it is fully paid rather than mentioning a zero balance', () => {
    // "There is a balance of UGX 0 to settle" is the kind of line that makes a
    // shop stop trusting the button.
    const message = suggestedMessage({ ...base, balance: settled })
    expect(message).toContain('fully paid')
    expect(message).not.toContain('0 to settle')
  })

  it('produces a distinct message for every stage', () => {
    const stages = [
      'measured',
      'in_progress',
      'ready',
      'picked_up',
      'returned',
      'assessing',
      'approved',
      'repairing',
    ] as const
    const messages = stages.map((stage) =>
      suggestedMessage({ ...base, order: { ...base.order, stage }, balance: owing }),
    )
    expect(new Set(messages).size).toBe(stages.length)
    for (const message of messages) expect(message.length).toBeGreaterThan(20)
  })
})
