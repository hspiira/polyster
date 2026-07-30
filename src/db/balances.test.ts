import { describe, expect, it } from 'vitest'
import { calculateBalance } from './balances'

const order = { id: 'order-1', price_total: 250000 }

describe('calculateBalance', () => {
  it('reports the full price outstanding when nothing has been paid', () => {
    expect(calculateBalance(order, [])).toEqual({
      order_id: 'order-1',
      price_total: 250000,
      amount_paid: 0,
      balance: 250000,
      fully_paid: false,
    })
  })

  it('sums partial payments', () => {
    const result = calculateBalance(order, [{ amount: 100000 }, { amount: 50000 }])
    expect(result.amount_paid).toBe(150000)
    expect(result.balance).toBe(100000)
    expect(result.fully_paid).toBe(false)
  })

  it('marks an order fully paid once payments reach the total', () => {
    const result = calculateBalance(order, [{ amount: 200000 }, { amount: 50000 }])
    expect(result.balance).toBe(0)
    expect(result.fully_paid).toBe(true)
  })

  it('reports a negative balance on overpayment rather than clamping to zero', () => {
    const result = calculateBalance(order, [{ amount: 260000 }])
    expect(result.balance).toBe(-10000)
    expect(result.fully_paid).toBe(true)
  })

  it('does not accumulate floating point error across many small payments', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point. Ten of them must still be
    // exactly 1.00, or a fully-paid order shows a balance of 0.0000000001.
    const payments = Array.from({ length: 10 }, () => ({ amount: 0.1 }))
    const result = calculateBalance({ id: 'order-2', price_total: 1 }, payments)
    expect(result.amount_paid).toBe(1)
    expect(result.balance).toBe(0)
    expect(result.fully_paid).toBe(true)
  })

  it('handles the two-decimal precision the numeric(12,2) column allows', () => {
    const result = calculateBalance({ id: 'order-3', price_total: 99.99 }, [{ amount: 33.33 }])
    expect(result.amount_paid).toBe(33.33)
    expect(result.balance).toBe(66.66)
  })
})
