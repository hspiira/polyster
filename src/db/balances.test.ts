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
    const result = calculateBalance(order, [{ amount_minor: 100000 }, { amount_minor: 50000 }])
    expect(result.amount_paid_minor).toBe(150000)
    expect(result.balance_minor).toBe(100000)
    expect(result.fully_paid).toBe(false)
  })

  it('marks an order fully paid once payments reach the total', () => {
    const result = calculateBalance(order, [{ amount_minor: 200000 }, { amount_minor: 50000 }])
    expect(result.balance_minor).toBe(0)
    expect(result.fully_paid).toBe(true)
  })

  it('reports a negative balance on overpayment rather than clamping to zero', () => {
    const result = calculateBalance(order, [{ amount_minor: 260000 }])
    expect(result.balance_minor).toBe(-10000)
    expect(result.fully_paid).toBe(true)
  })

  it('does not accumulate floating point error across many small payments', () => {
    // Minor units are integers, so this no longer risks binary floating point
    // error -- kept as a regression check that the sum stays exact.
    const payments = Array.from({ length: 10 }, () => ({ amount_minor: 10 }))
    const result = calculateBalance({ id: 'order-2', price_total_minor: 100 }, payments)
    expect(result.amount_paid_minor).toBe(100)
    expect(result.balance_minor).toBe(0)
    expect(result.fully_paid).toBe(true)
  })

  it('handles amounts that do not divide evenly', () => {
    const result = calculateBalance(
      { id: 'order-3', price_total_minor: 9999 },
      [{ amount_minor: 3333 }],
    )
    expect(result.amount_paid_minor).toBe(3333)
    expect(result.balance_minor).toBe(6666)
  })
})
