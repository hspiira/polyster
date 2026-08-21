import { describe, expect, it } from 'vitest'
import { buildMoneyFeed } from './moneyFeed'
import type { ExpenseDoc, PaymentDoc, SaleDoc } from '../db/schema'

const ORDERS = new Map([['order-1', { currency: 'UGX', clientName: 'Aisha' }]])

function sale(over: Partial<SaleDoc> = {}): SaleDoc {
  return {
    id: 'sale-1',
    shop_id: 'shop-1',
    item_description: 'Ready-made shirt',
    quantity: 1,
    currency: 'UGX',
    unit_price_minor: 30_000,
    method: 'cash',
    sold_at: '2026-08-13T10:00:00.000Z',
    created_at: '2026-08-13T10:00:00.000Z',
    updated_at: '2026-08-13T10:00:00.000Z',
    ...over,
  }
}

function payment(over: Partial<PaymentDoc> = {}): PaymentDoc {
  return {
    id: 'payment-1',
    shop_id: 'shop-1',
    order_id: 'order-1',
    amount_minor: 50_000,
    kind: 'payment',
    payment_date: '2026-08-13T09:00:00.000Z',
    method: 'mobile_money',
    created_at: '2026-08-13T09:00:00.000Z',
    ...over,
  }
}

function expense(over: Partial<ExpenseDoc> = {}): ExpenseDoc {
  return {
    id: 'expense-1',
    shop_id: 'shop-1',
    category: 'materials',
    description: 'Fabric from Kikuubo',
    currency: 'UGX',
    amount_minor: 20_000,
    spent_on: '2026-08-13',
    created_at: '2026-08-13T08:00:00.000Z',
    updated_at: '2026-08-13T08:00:00.000Z',
    ...over,
  }
}

const WINDOW = { from: '2026-08-07', to: '2026-08-13' }

function build(input: {
  sales?: SaleDoc[]
  payments?: PaymentDoc[]
  expenses?: ExpenseDoc[]
  from?: string
  to?: string
}) {
  return buildMoneyFeed({
    sales: input.sales ?? [],
    payments: input.payments ?? [],
    expenses: input.expenses ?? [],
    orders: ORDERS,
    fallbackCurrency: 'UGX',
    from: input.from ?? WINDOW.from,
    to: input.to ?? WINDOW.to,
  })
}

describe('buildMoneyFeed', () => {
  it('directs sales and order payments in, expenses out', () => {
    const feed = build({ sales: [sale()], payments: [payment()], expenses: [expense()] })
    expect(feed.map((entry) => [entry.id, entry.direction])).toEqual([
      ['sale-1', 'in'],
      ['payment-1', 'in'],
      ['expense-1', 'out'],
    ])
  })

  it('treats a refund as money going out, still positive', () => {
    const [entry] = build({ payments: [payment({ kind: 'refund' })] })
    expect(entry?.direction).toBe('out')
    expect(entry?.amountMinor).toBe(50_000)
  })

  it('totals a sale line rather than reporting its unit price', () => {
    const [entry] = build({ sales: [sale({ quantity: 3, unit_price_minor: 30_000 })] })
    expect(entry?.amountMinor).toBe(90_000)
    expect(entry?.title).toBe('3 × Ready-made shirt')
  })

  it('excludes rows outside the window, on either edge', () => {
    const feed = build({
      sales: [sale({ id: 'old', sold_at: '2026-08-06T23:59:00.000Z' })],
      expenses: [
        expense({ id: 'edge', spent_on: '2026-08-07' }),
        expense({ id: 'future', spent_on: '2026-08-14' }),
      ],
    })
    expect(feed.map((entry) => entry.id)).toEqual(['edge'])
  })

  it('orders most recent first', () => {
    const feed = build({
      sales: [
        sale({ id: 'newest', sold_at: '2026-08-13T15:00:00.000Z' }),
        sale({ id: 'older', sold_at: '2026-08-09T15:00:00.000Z' }),
      ],
      expenses: [expense({ id: 'middle', spent_on: '2026-08-11' })],
    })
    expect(feed.map((entry) => entry.id)).toEqual(['newest', 'middle', 'older'])
  })

  it('names the client a payment came from, and takes the order currency', () => {
    const [entry] = build({ payments: [payment()] })
    expect(entry?.title).toBe('Aisha')
    expect(entry?.currency).toBe('UGX')
  })

  it('falls back when the payment order is not on this device', () => {
    const [entry] = build({ payments: [payment({ order_id: 'order-elsewhere' })] })
    expect(entry?.title).toBe('Order payment')
    expect(entry?.currency).toBe('UGX')
  })
})
