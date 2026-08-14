import { describe, expect, it } from 'vitest'
import {
  calculateBalance,
  clientTotals,
  clientTotalsById,
  noClientTotals,
  signedAmountMinor,
} from './balances'
import type { OrderDoc } from './schema'

const order = { id: 'order-1', price_total_minor: 250000 }

describe('signedAmountMinor', () => {
  it('counts a payment as money in', () => {
    expect(signedAmountMinor({ amount_minor: 5000, kind: 'payment' })).toBe(5000)
  })

  // Both kinds are stored positive (schema.ts: "a refund is a positive row
  // with kind 'refund'"), so the sign has to come from the kind, not the value.
  it('counts a refund as money back out', () => {
    expect(signedAmountMinor({ amount_minor: 5000, kind: 'refund' })).toBe(-5000)
  })

  // Reports aggregates "collected" separately, but through here, so it cannot
  // drift from calculateBalance or the view's `case when pm.kind = 'refund'`.
  it('is what every money-in total is summed through', () => {
    const rows = [
      { amount_minor: 100000, kind: 'payment' as const },
      { amount_minor: 30000, kind: 'refund' as const },
    ]
    expect(rows.reduce((sum, row) => sum + signedAmountMinor(row), 0)).toBe(70000)
  })
})

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

  it('ignores rental_deposit_minor even when the order object carries one', () => {
    // Pick<> admits only id and price_total_minor, so an assertion smuggles a
    // deposit in: present and provably ignored, rather than merely absent.
    const orderWithDeposit = {
      id: 'o1',
      price_total_minor: 100000,
      rental_deposit_minor: 50000,
    } as Pick<OrderDoc, 'id' | 'price_total_minor'>

    const payments = [{ amount_minor: 40000, kind: 'payment' as const }]

    const withDeposit = calculateBalance(orderWithDeposit, payments)
    const withoutDeposit = calculateBalance({ id: 'o1', price_total_minor: 100000 }, payments)

    expect(withDeposit).toEqual(withoutDeposit)
    expect(withDeposit.amount_paid_minor).toBe(40000)
    expect(withDeposit.balance_minor).toBe(60000)
  })

  it('reports a larger balance when refunds exceed everything paid', () => {
    // A refund larger than what was collected. Same convention as overpayment
    // above -- report the real number -- so the balance grows past the total.
    const result = calculateBalance({ id: 'o1', price_total_minor: 100000 }, [
      { amount_minor: 50000, kind: 'payment' },
      { amount_minor: 80000, kind: 'refund' },
    ])
    expect(result.amount_paid_minor).toBe(-30000)
    expect(result.balance_minor).toBe(130000)
    expect(result.fully_paid).toBe(false)
  })
})

describe('clientTotals', () => {
  const balances = new Map([
    ['a', { order_id: 'a', price_total_minor: 100, amount_paid_minor: 40, balance_minor: 60, fully_paid: false }],
    ['b', { order_id: 'b', price_total_minor: 100, amount_paid_minor: 100, balance_minor: 0, fully_paid: true }],
    ['c', { order_id: 'c', price_total_minor: 100, amount_paid_minor: 0, balance_minor: 100, fully_paid: false }],
    ['d', { order_id: 'd', price_total_minor: 100, amount_paid_minor: 130, balance_minor: -30, fully_paid: true }],
  ])

  it('sums only what is still owed', () => {
    const totals = clientTotals(
      [
        { id: 'a', stage: 'in_progress' },
        { id: 'b', stage: 'ready' },
      ],
      balances,
    )
    expect(totals.owedMinor).toBe(60)
  })

  // Cancelled work keeps its balance in the data but is never chased.
  it('ignores a cancelled order even when it still shows a balance', () => {
    const totals = clientTotals(
      [
        { id: 'a', stage: 'in_progress' },
        { id: 'c', stage: 'cancelled' },
      ],
      balances,
    )
    expect(totals.owedMinor).toBe(60)
  })

  // An overpayment on one order must not cancel out what another owes.
  it('does not let an overpaid order reduce the total', () => {
    const totals = clientTotals(
      [
        { id: 'a', stage: 'in_progress' },
        { id: 'd', stage: 'ready' },
      ],
      balances,
    )
    expect(totals.owedMinor).toBe(60)
  })

  it('counts only stages that still need doing as open', () => {
    const totals = clientTotals(
      [
        { id: 'a', stage: 'measured' },
        { id: 'b', stage: 'in_progress' },
        { id: 'c', stage: 'picked_up' },
        { id: 'd', stage: 'cancelled' },
      ],
      balances,
    )
    expect(totals.openOrders).toBe(2)
    expect(totals.totalOrders).toBe(4)
  })

  it('reports nothing for a client with no orders', () => {
    expect(clientTotals([], balances)).toEqual(noClientTotals())
  })

  it('treats an order with no balance row as owing nothing', () => {
    expect(clientTotals([{ id: 'missing', stage: 'ready' }], balances).owedMinor).toBe(0)
  })
})

describe('clientTotalsById', () => {
  const balances = new Map([
    ['a', { order_id: 'a', price_total_minor: 100, amount_paid_minor: 0, balance_minor: 100, fully_paid: false }],
    ['b', { order_id: 'b', price_total_minor: 100, amount_paid_minor: 25, balance_minor: 75, fully_paid: false }],
  ])

  it('keeps each client to their own orders', () => {
    const totals = clientTotalsById(
      [
        { id: 'a', client_id: 'ama', stage: 'ready' },
        { id: 'b', client_id: 'ben', stage: 'cancelled' },
      ],
      balances,
    )
    expect(totals.get('ama')?.owedMinor).toBe(100)
    expect(totals.get('ben')?.owedMinor).toBe(0)
  })

  it('agrees with clientTotals over the same orders', () => {
    const orders = [
      { id: 'a', client_id: 'ama', stage: 'ready' as const },
      { id: 'b', client_id: 'ama', stage: 'in_progress' as const },
    ]
    expect(clientTotalsById(orders, balances).get('ama')).toEqual(clientTotals(orders, balances))
  })

  it('has no entry for a client with no orders', () => {
    expect(clientTotalsById([], balances).get('ama')).toBeUndefined()
  })
})
