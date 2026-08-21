import { describe, expect, it } from 'vitest'
import { cashFlow, cumulativeNet, emptyBuckets, grainFor } from './reportsModel'
import type { ExpenseDoc, PaymentDoc, SaleDoc } from '../db/schema'

function sale(soldAt: string, unitPriceMinor: number, quantity = 1): SaleDoc {
  return {
    id: `sale-${soldAt}-${unitPriceMinor}`,
    shop_id: 'shop-1',
    item_description: 'Cap',
    quantity,
    currency: 'UGX',
    unit_price_minor: unitPriceMinor,
    method: 'cash',
    sold_at: soldAt,
    created_at: soldAt,
    updated_at: soldAt,
  }
}

function payment(date: string, amountMinor: number, kind: PaymentDoc['kind'] = 'payment'): PaymentDoc {
  return {
    id: `payment-${date}-${amountMinor}-${kind}`,
    shop_id: 'shop-1',
    order_id: 'order-1',
    amount_minor: amountMinor,
    kind,
    payment_date: date,
    method: 'cash',
    created_at: date,
  }
}

function expense(spentOn: string, amountMinor: number): ExpenseDoc {
  return {
    id: `expense-${spentOn}-${amountMinor}`,
    shop_id: 'shop-1',
    category: 'materials',
    description: 'Fabric',
    currency: 'UGX',
    amount_minor: amountMinor,
    spent_on: spentOn,
    created_at: spentOn,
    updated_at: spentOn,
  }
}

describe('grainFor', () => {
  it('keeps a column readable instead of drawing 90 slivers', () => {
    expect(grainFor('2026-08-07', '2026-08-13')).toBe('day')
    expect(grainFor('2026-07-15', '2026-08-13')).toBe('week')
    expect(grainFor('2025-08-14', '2026-08-13')).toBe('month')
  })
})

describe('emptyBuckets', () => {
  it('covers the window with one bucket per day', () => {
    const buckets = emptyBuckets('2026-08-11', '2026-08-13', 'day')
    expect(buckets.map((b) => b.from)).toEqual(['2026-08-11', '2026-08-12', '2026-08-13'])
    expect(buckets.map((b) => b.label)).toEqual(['11', '12', '13'])
  })

  it('anchors weeks to the end of the window, clipping the oldest', () => {
    const buckets = emptyBuckets('2026-08-01', '2026-08-13', 'week')
    expect(buckets.at(-1)).toMatchObject({ from: '2026-08-07', to: '2026-08-13' })
    expect(buckets[0]).toMatchObject({ from: '2026-08-01', to: '2026-08-06' })
  })

  it('leaves a quiet period as a gap rather than skipping it', () => {
    const buckets = emptyBuckets('2026-08-11', '2026-08-13', 'day')
    expect(buckets.every((b) => b.inMinor === 0 && b.outMinor === 0)).toBe(true)
  })
})

describe('cashFlow', () => {
  const window = { from: '2026-08-11', to: '2026-08-13' }

  it('puts each row in the bucket for its own day', () => {
    const buckets = cashFlow({
      sales: [sale('2026-08-11T10:00:00.000Z', 30_000)],
      payments: [payment('2026-08-13T09:00:00.000Z', 50_000)],
      expenses: [expense('2026-08-12', 20_000)],
      ...window,
    })
    expect(buckets.map((b) => [b.inMinor, b.outMinor])).toEqual([
      [30_000, 0],
      [0, 20_000],
      [50_000, 0],
    ])
  })

  it('totals a sale line rather than its unit price', () => {
    const [bucket] = cashFlow({
      sales: [sale('2026-08-11T10:00:00.000Z', 30_000, 3)],
      payments: [],
      expenses: [],
      ...window,
    })
    expect(bucket?.inMinor).toBe(90_000)
  })

  it('lowers money in for a refund instead of calling it spending', () => {
    const buckets = cashFlow({
      sales: [],
      payments: [payment('2026-08-11T09:00:00.000Z', 50_000), payment('2026-08-11T11:00:00.000Z', 20_000, 'refund')],
      expenses: [],
      ...window,
    })
    expect(buckets[0]).toMatchObject({ inMinor: 30_000, outMinor: 0 })
  })

  it('ignores rows outside the window', () => {
    const buckets = cashFlow({
      sales: [sale('2026-08-01T10:00:00.000Z', 99_000)],
      payments: [],
      expenses: [expense('2026-08-20', 99_000)],
      ...window,
    })
    expect(buckets.reduce((sum, b) => sum + b.inMinor + b.outMinor, 0)).toBe(0)
  })

  it('nets each bucket', () => {
    const buckets = cashFlow({
      sales: [sale('2026-08-12T10:00:00.000Z', 30_000)],
      payments: [],
      expenses: [expense('2026-08-12', 50_000)],
      ...window,
    })
    expect(buckets[1]?.netMinor).toBe(-20_000)
  })
})

describe('cumulativeNet', () => {
  it('adds each bucket to the ones before it', () => {
    const buckets = cashFlow({
      sales: [sale('2026-08-11T10:00:00.000Z', 100_000), sale('2026-08-13T10:00:00.000Z', 50_000)],
      payments: [],
      expenses: [expense('2026-08-12', 30_000)],
      from: '2026-08-11',
      to: '2026-08-13',
    })
    expect(cumulativeNet(buckets)).toEqual([100_000, 70_000, 120_000])
  })
})
