import { describe, expect, it } from 'vitest'
import { calculateBalance } from './balances'

const order = { id: 'order-1', price_total_minor: 250000 }

describe('calculateBalance', () => {
  it('reports the full price outstanding when nothing has been paid', () => {
    expect(calculateBalance(order, [])).toEqual({
      order_id: 'order-1',
      price_total_minor: 250000,
      amount_paid_minor: 0,
      balance_minor: 250000,
      fully_paid: false,
    })
  })

  it('sums partial payments', () => {
    const result = calculateBalance(order, [
      { amount_minor: 100000, kind: 'payment' },
      { amount_minor: 50000, kind: 'payment' },
    ])
    expect(result.amount_paid_minor).toBe(150000)
    expect(result.balance_minor).toBe(100000)
    expect(result.fully_paid).toBe(false)
  })

  it('marks an order fully paid once payments reach the total', () => {
    const result = calculateBalance(order, [
      { amount_minor: 200000, kind: 'payment' },
      { amount_minor: 50000, kind: 'payment' },
    ])
    expect(result.balance_minor).toBe(0)
    expect(result.fully_paid).toBe(true)
  })

  it('reports a negative balance on overpayment rather than clamping to zero', () => {
    const result = calculateBalance(order, [{ amount_minor: 260000, kind: 'payment' }])
    expect(result.balance_minor).toBe(-10000)
    expect(result.fully_paid).toBe(true)
  })

  it('does not accumulate floating point error across many small payments', () => {
    // Minor units are integers, so this no longer risks binary floating point
    // error -- kept as a regression check that the sum stays exact.
    const payments = Array.from({ length: 10 }, () => ({ amount_minor: 10, kind: 'payment' as const }))
    const result = calculateBalance({ id: 'order-2', price_total_minor: 100 }, payments)
    expect(result.amount_paid_minor).toBe(100)
    expect(result.balance_minor).toBe(0)
    expect(result.fully_paid).toBe(true)
  })

  it('handles amounts that do not divide evenly', () => {
    const result = calculateBalance(
      { id: 'order-3', price_total_minor: 9999 },
      [{ amount_minor: 3333, kind: 'payment' }],
    )
    expect(result.amount_paid_minor).toBe(3333)
    expect(result.balance_minor).toBe(6666)
  })

  it('subtracts refunds from the amount paid', () => {
    const balance = calculateBalance(
      { id: 'o1', price_total_minor: 150000 },
      [
        { amount_minor: 100000, kind: 'payment' },
        { amount_minor: 20000, kind: 'refund' },
      ],
    )
    expect(balance.amount_paid_minor).toBe(80000)
    expect(balance.balance_minor).toBe(70000)
    expect(balance.fully_paid).toBe(false)
  })

  it('never counts a rental deposit as payment', () => {
    // rental_deposit_minor is not an input to this function at all. If it ever
    // becomes one, this test should be deleted deliberately, not quietly.
    const balance = calculateBalance({ id: 'o1', price_total_minor: 100000 }, [
      { amount_minor: 100000, kind: 'payment' },
    ])
    expect(balance.fully_paid).toBe(true)
  })
})
