import { describe, expect, it } from 'vitest'
import { customerLifetimeValues } from './customerValue'
import type { ClientDoc, OrderDoc, PaymentDoc, SaleDoc } from './schema'

const client = (over: Partial<ClientDoc> = {}): ClientDoc => ({
  id: crypto.randomUUID(),
  shop_id: 'shop-1',
  name: 'Amina',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

const order = (over: Partial<OrderDoc> = {}): OrderDoc => ({
  id: crypto.randomUUID(),
  shop_id: 'shop-1',
  client_id: 'client-1',
  order_type: 'tailor_made',
  reference: '1208-ABCDE',
  currency: 'UGX',
  summary: 'Suit',
  stage: 'measured',
  price_total_minor: 100000,
  price_adjustment_minor: 0,
  rental_deposit_minor: 0,
  pickup_due_date: '2026-08-20',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

const payment = (over: Partial<PaymentDoc> = {}): PaymentDoc => ({
  id: crypto.randomUUID(),
  order_id: 'order-1',
  amount_minor: 100000,
  kind: 'payment',
  payment_date: '2026-08-10T10:00:00.000Z',
  created_at: '2026-08-10T10:00:00.000Z',
  method: 'cash',
  ...over,
})

const sale = (over: Partial<SaleDoc> = {}): SaleDoc => ({
  id: crypto.randomUUID(),
  shop_id: 'shop-1',
  item_description: 'Kitenge shirt',
  quantity: 1,
  currency: 'UGX',
  unit_price_minor: 40000,
  method: 'cash',
  sold_at: '2026-08-05T10:00:00.000Z',
  created_at: '2026-08-05T10:00:00.000Z',
  updated_at: '2026-08-05T10:00:00.000Z',
  ...over,
})

describe('customerLifetimeValues', () => {
  it('counts payments actually received, not order face value', () => {
    const clients = [client({ id: 'c1', name: 'Amina' })]
    const orders = [order({ id: 'o1', client_id: 'c1', price_total_minor: 500000 })]
    const payments = [payment({ order_id: 'o1', amount_minor: 100000 })]

    const value = customerLifetimeValues(clients, orders, payments, [])[0]!
    expect(value.paidMinor).toBe(100000)
    expect(value.ordersCount).toBe(1)
  })

  it('nets a refund against what was paid', () => {
    const clients = [client({ id: 'c1' })]
    const orders = [order({ id: 'o1', client_id: 'c1' })]
    const payments = [
      payment({ order_id: 'o1', amount_minor: 100000, kind: 'payment' }),
      payment({ order_id: 'o1', amount_minor: 30000, kind: 'refund' }),
    ]

    const value = customerLifetimeValues(clients, orders, payments, [])[0]!
    expect(value.paidMinor).toBe(70000)
  })

  it('adds sales recorded directly against the client', () => {
    const clients = [client({ id: 'c1' })]
    const orders = [order({ id: 'o1', client_id: 'c1' })]
    const payments = [payment({ order_id: 'o1', amount_minor: 50000 })]
    const sales = [sale({ client_id: 'c1', quantity: 2, unit_price_minor: 40000 })]

    const value = customerLifetimeValues(clients, orders, payments, sales)[0]!
    expect(value.paidMinor).toBe(50000 + 80000)
  })

  it('sorts highest paid first and omits a client with no activity at all', () => {
    const clients = [client({ id: 'c1', name: 'Small spender' }), client({ id: 'c2', name: 'Big spender' }), client({ id: 'c3', name: 'Never ordered' })]
    const orders = [order({ id: 'o1', client_id: 'c1' }), order({ id: 'o2', client_id: 'c2' })]
    const payments = [
      payment({ order_id: 'o1', amount_minor: 10000 }),
      payment({ order_id: 'o2', amount_minor: 90000 }),
    ]

    const values = customerLifetimeValues(clients, orders, payments, [])
    expect(values.map((v) => v.name)).toEqual(['Big spender', 'Small spender'])
  })

  it('tracks the most recent payment date across payments and sales', () => {
    const clients = [client({ id: 'c1' })]
    const orders = [order({ id: 'o1', client_id: 'c1' })]
    const payments = [payment({ order_id: 'o1', payment_date: '2026-08-01T00:00:00.000Z' })]
    const sales = [sale({ client_id: 'c1', sold_at: '2026-08-15T00:00:00.000Z' })]

    const value = customerLifetimeValues(clients, orders, payments, sales)[0]!
    expect(value.lastPaidAt).toBe('2026-08-15T00:00:00.000Z')
  })
})
