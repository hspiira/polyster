/** Sales, order payments and expenses interleaved into one chronological list. */
import { saleTotalMinor, withinWindow } from '../db/profit'
import { EXPENSE_CATEGORY_LABELS } from './expenseCategories'
import { PAYMENT_METHOD_LABELS } from './orderStage'
import type { ExpenseDoc, PaymentDoc, SaleDoc } from '../db/schema'

export type MoneyDirection = 'in' | 'out'

export interface MoneyEntry {
  id: string
  direction: MoneyDirection
  /** Always positive. `direction` carries the sign. */
  amountMinor: number
  currency: string
  title: string
  meta: string
  /** YYYY-MM-DD. */
  day: string
  href: string
}

export interface MoneyFeedInput {
  sales: readonly SaleDoc[]
  /** Scoped to this shop's orders by the caller -- a payment carries no shop_id. */
  payments: readonly PaymentDoc[]
  expenses: readonly ExpenseDoc[]
  orders: ReadonlyMap<string, { currency: string; clientName?: string }>
  fallbackCurrency: string
  from: string
  to: string
}

interface SortableEntry {
  at: string
  entry: MoneyEntry
}

function compare(a: SortableEntry, b: SortableEntry): number {
  if (a.entry.day !== b.entry.day) return a.entry.day < b.entry.day ? 1 : -1
  if (a.at !== b.at) return a.at < b.at ? 1 : -1
  return a.entry.id < b.entry.id ? -1 : 1
}

export function buildMoneyFeed({
  sales,
  payments,
  expenses,
  orders,
  fallbackCurrency,
  from,
  to,
}: MoneyFeedInput): MoneyEntry[] {
  const rows: SortableEntry[] = []

  for (const sale of sales) {
    if (!withinWindow(sale.sold_at, from, to)) continue
    rows.push({
      at: sale.sold_at,
      entry: {
        id: sale.id,
        direction: 'in',
        amountMinor: saleTotalMinor(sale),
        currency: sale.currency,
        title:
          sale.quantity > 1
            ? `${sale.quantity} × ${sale.item_description}`
            : sale.item_description,
        meta: `Counter sale · ${PAYMENT_METHOD_LABELS[sale.method]}`,
        day: sale.sold_at.slice(0, 10),
        href: '/sales',
      },
    })
  }

  for (const payment of payments) {
    if (!withinWindow(payment.payment_date, from, to)) continue
    const order = orders.get(payment.order_id)
    const refund = payment.kind === 'refund'
    rows.push({
      at: payment.payment_date,
      entry: {
        id: payment.id,
        direction: refund ? 'out' : 'in',
        amountMinor: payment.amount_minor,
        currency: order?.currency ?? fallbackCurrency,
        title: order?.clientName ?? (refund ? 'Refund' : 'Order payment'),
        meta: `${refund ? 'Refund' : 'Paid on an order'} · ${PAYMENT_METHOD_LABELS[payment.method]}`,
        day: payment.payment_date.slice(0, 10),
        href: `/orders/${payment.order_id}`,
      },
    })
  }

  for (const expense of expenses) {
    if (!withinWindow(expense.spent_on, from, to)) continue
    rows.push({
      at: expense.spent_on,
      entry: {
        id: expense.id,
        direction: 'out',
        amountMinor: expense.amount_minor,
        currency: expense.currency,
        title: expense.description,
        meta: EXPENSE_CATEGORY_LABELS[expense.category],
        day: expense.spent_on,
        href: '/expenses',
      },
    })
  }

  return rows.sort(compare).map((row) => row.entry)
}
