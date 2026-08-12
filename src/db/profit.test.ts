import { describe, expect, it } from 'vitest'
import { itemsSold, profitAndLoss, saleTotalMinor } from './profit'
import type { ExpenseDoc, PaymentDoc, SaleDoc } from './schema'

const sale = (over: Partial<SaleDoc> = {}): SaleDoc => ({
  id: crypto.randomUUID(),
  shop_id: 'shop-1',
  item_description: 'Kitenge shirt',
  quantity: 1,
  currency: 'UGX',
  unit_price_minor: 40000,
  method: 'cash',
  sold_at: '2026-08-10T10:00:00.000Z',
  created_at: '2026-08-10T10:00:00.000Z',
  updated_at: '2026-08-10T10:00:00.000Z',
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

const expense = (over: Partial<ExpenseDoc> = {}): ExpenseDoc => ({
  id: crypto.randomUUID(),
  shop_id: 'shop-1',
  category: 'materials',
  description: 'Fabric',
  currency: 'UGX',
  amount_minor: 30000,
  spent_on: '2026-08-10',
  created_at: '2026-08-10T10:00:00.000Z',
  updated_at: '2026-08-10T10:00:00.000Z',
  ...over,
})

const WINDOW = { from: '2026-08-01', to: '2026-08-31' }
const EMPTY = { sales: [], payments: [], expenses: [], ...WINDOW }

describe('saleTotalMinor', () => {
  it('multiplies unit price by quantity', () => {
    expect(saleTotalMinor({ quantity: 3, unit_price_minor: 40000 })).toBe(120000)
  })

  it('handles a giveaway recorded at zero', () => {
    expect(saleTotalMinor({ quantity: 2, unit_price_minor: 0 })).toBe(0)
  })
})

describe('profitAndLoss', () => {
  it('counts sales and order payments as two streams of one income', () => {
    const result = profitAndLoss({
      ...EMPTY,
      sales: [sale({ quantity: 2, unit_price_minor: 40000 })],
      payments: [payment({ amount_minor: 100000 })],
    })

    expect(result.salesIncomeMinor).toBe(80000)
    expect(result.orderIncomeMinor).toBe(100000)
    expect(result.incomeMinor).toBe(180000)
  })

  it('subtracts expenses to give profit', () => {
    const result = profitAndLoss({
      ...EMPTY,
      sales: [sale({ unit_price_minor: 100000 })],
      expenses: [expense({ amount_minor: 30000 })],
    })

    expect(result.expensesMinor).toBe(30000)
    expect(result.profitMinor).toBe(70000)
  })

  it('reports a loss as negative rather than clamping to zero', () => {
    const result = profitAndLoss({ ...EMPTY, expenses: [expense({ amount_minor: 50000 })] })
    expect(result.profitMinor).toBe(-50000)
  })

  it('subtracts refunds from income rather than adding them', () => {
    // The bug this guards: treating every payment row as money in. A refund is
    // stored as a positive row with kind 'refund', so a naive sum inflates
    // income by twice the refund.
    const result = profitAndLoss({
      ...EMPTY,
      payments: [
        payment({ amount_minor: 100000, kind: 'payment' }),
        payment({ amount_minor: 30000, kind: 'refund' }),
      ],
    })

    expect(result.orderIncomeMinor).toBe(70000)
  })

  it('never counts an unpaid order as income', () => {
    expect(profitAndLoss(EMPTY).incomeMinor).toBe(0)
    expect(profitAndLoss(EMPTY).profitMinor).toBe(0)
  })

  it('includes both window edges and excludes their neighbours', () => {
    const result = profitAndLoss({
      ...EMPTY,
      sales: [
        sale({ sold_at: '2026-07-31T23:00:00.000Z', unit_price_minor: 999 }),
        sale({ sold_at: '2026-08-01T00:00:00.000Z', unit_price_minor: 10000 }),
        sale({ sold_at: '2026-08-31T23:59:00.000Z', unit_price_minor: 20000 }),
        sale({ sold_at: '2026-09-01T00:00:00.000Z', unit_price_minor: 999 }),
      ],
      expenses: [
        expense({ spent_on: '2026-07-31', amount_minor: 999 }),
        expense({ spent_on: '2026-08-31', amount_minor: 5000 }),
      ],
    })

    expect(result.salesIncomeMinor).toBe(30000)
    expect(result.expensesMinor).toBe(5000)
  })

  it('groups expenses by category, largest first', () => {
    const result = profitAndLoss({
      ...EMPTY,
      expenses: [
        expense({ category: 'materials', amount_minor: 10000 }),
        expense({ category: 'rent', amount_minor: 80000 }),
        expense({ category: 'materials', amount_minor: 15000 }),
        expense({ category: 'transport', amount_minor: 5000 }),
      ],
    })

    expect(result.byCategory).toEqual([
      { category: 'rent', amountMinor: 80000 },
      { category: 'materials', amountMinor: 25000 },
      { category: 'transport', amountMinor: 5000 },
    ])
  })
})

describe('itemsSold', () => {
  it('groups by item and sorts by revenue', () => {
    const result = itemsSold(
      [
        sale({ item_description: 'Kitenge shirt', quantity: 2, unit_price_minor: 40000 }),
        sale({ item_description: 'Head wrap', quantity: 1, unit_price_minor: 15000 }),
        sale({ item_description: 'Kitenge shirt', quantity: 1, unit_price_minor: 40000 }),
      ],
      WINDOW.from,
      WINDOW.to,
    )

    expect(result).toEqual([
      { item: 'Kitenge shirt', quantity: 3, revenueMinor: 120000 },
      { item: 'Head wrap', quantity: 1, revenueMinor: 15000 },
    ])
  })

  it('treats differently-cased and padded spellings as one product', () => {
    const result = itemsSold(
      [
        sale({ item_description: 'Kitenge shirt' }),
        sale({ item_description: 'kitenge shirt' }),
        sale({ item_description: '  Kitenge Shirt  ' }),
      ],
      WINDOW.from,
      WINDOW.to,
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.quantity).toBe(3)
    expect(result[0]?.item).toBe('Kitenge shirt')
  })

  it('excludes sales outside the window', () => {
    const result = itemsSold(
      [
        sale({ item_description: 'In', sold_at: '2026-08-15T09:00:00.000Z' }),
        sale({ item_description: 'Out', sold_at: '2026-09-15T09:00:00.000Z' }),
      ],
      WINDOW.from,
      WINDOW.to,
    )

    expect(result.map((row) => row.item)).toEqual(['In'])
  })

  it('returns nothing when there were no sales', () => {
    expect(itemsSold([], WINDOW.from, WINDOW.to)).toEqual([])
  })
})
