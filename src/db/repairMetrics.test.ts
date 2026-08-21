import { describe, expect, it } from 'vitest'
import { repairMetrics } from './repairMetrics'
import type { OrderDoc, PaymentDoc } from './schema'

const order = (over: Partial<OrderDoc> = {}): OrderDoc => ({
  id: crypto.randomUUID(),
  shop_id: 'shop-1',
  client_id: 'client-1',
  order_type: 'repair',
  reference: '1208-ABCDE',
  currency: 'UGX',
  summary: 'Replace zipper',
  stage: 'measured',
  price_total_minor: 10000,
  price_adjustment_minor: 0,
  rental_deposit_minor: 0,
  pickup_due_date: '2026-08-20',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

const payment = (over: Partial<PaymentDoc> = {}): PaymentDoc => ({
  id: crypto.randomUUID(),
  shop_id: 'shop-1',
  order_id: 'order-1',
  amount_minor: 10000,
  kind: 'payment',
  payment_date: '2026-08-10T10:00:00.000Z',
  created_at: '2026-08-10T10:00:00.000Z',
  method: 'cash',
  ...over,
})

describe('repairMetrics', () => {
  it('ignores non-repair orders entirely', () => {
    const orders = [order({ order_type: 'tailor_made' })]
    const metrics = repairMetrics(orders, [])
    expect(metrics.totalCount).toBe(0)
  })

  it('buckets by stage: open, completed, cancelled', () => {
    const orders = [
      order({ stage: 'assessing' }),
      order({ stage: 'repairing' }),
      order({ stage: 'picked_up', picked_up_at: '2026-08-05T00:00:00.000Z' }),
      order({ stage: 'cancelled' }),
    ]
    const metrics = repairMetrics(orders, [])
    expect(metrics.totalCount).toBe(4)
    expect(metrics.openCount).toBe(2)
    expect(metrics.completedCount).toBe(1)
    expect(metrics.cancelledCount).toBe(1)
  })

  it('counts payments actually received against repair orders, net of refunds', () => {
    const orders = [order({ id: 'o1' }), order({ id: 'o2' })]
    const payments = [
      payment({ order_id: 'o1', amount_minor: 10000, kind: 'payment' }),
      payment({ order_id: 'o2', amount_minor: 5000, kind: 'payment' }),
      payment({ order_id: 'o2', amount_minor: 2000, kind: 'refund' }),
    ]
    const metrics = repairMetrics(orders, payments)
    expect(metrics.paidMinor).toBe(13000)
  })

  it('ignores a payment against an order that is not a repair', () => {
    const orders = [order({ id: 'o1' })]
    const payments = [payment({ order_id: 'unrelated-order', amount_minor: 99999 })]
    const metrics = repairMetrics(orders, payments)
    expect(metrics.paidMinor).toBe(0)
  })

  it('averages turnaround only across repairs that actually reached picked_up', () => {
    const orders = [
      order({
        created_at: '2026-08-01T00:00:00.000Z',
        stage: 'picked_up',
        picked_up_at: '2026-08-04T00:00:00.000Z',
      }),
      order({
        created_at: '2026-08-01T00:00:00.000Z',
        stage: 'picked_up',
        picked_up_at: '2026-08-08T00:00:00.000Z',
      }),
      order({ stage: 'repairing' }),
    ]
    const metrics = repairMetrics(orders, [])
    expect(metrics.averageTurnaroundDays).toBe((3 + 7) / 2)
  })

  it('returns null turnaround when nothing has been picked up yet', () => {
    const orders = [order({ stage: 'assessing' })]
    const metrics = repairMetrics(orders, [])
    expect(metrics.averageTurnaroundDays).toBeNull()
  })
})
