/**
 * Shop-level profit and loss.
 *
 * Cash accounting: income is money received (sales, plus payments taken
 * against orders), never the value of orders written up. Outstanding is
 * reported separately on Reports.
 */
import { signedAmountMinor } from './balances'
import type { ExpenseCategory, ExpenseDoc, PaymentDoc, SaleDoc } from './schema'

export interface ProfitAndLoss {
  salesIncomeMinor: number
  orderIncomeMinor: number
  incomeMinor: number
  expensesMinor: number
  /** Negative is a loss, and is shown as one. */
  profitMinor: number
  byCategory: { category: ExpenseCategory; amountMinor: number }[]
}

export function saleTotalMinor(sale: Pick<SaleDoc, 'quantity' | 'unit_price_minor'>): number {
  return sale.quantity * sale.unit_price_minor
}

export interface PeriodInput {
  sales: readonly SaleDoc[]
  payments: readonly PaymentDoc[]
  expenses: readonly ExpenseDoc[]
  /** Inclusive ISO date, YYYY-MM-DD. */
  from: string
  /** Inclusive ISO date, YYYY-MM-DD. */
  to: string
}

// Compared as YYYY-MM-DD strings, which orders identically to dates with no
// timezone reinterpretation -- same reasoning as lib/dates.ts.
function withinWindow(iso: string, from: string, to: string): boolean {
  const day = iso.slice(0, 10)
  return day >= from && day <= to
}

export function profitAndLoss({ sales, payments, expenses, from, to }: PeriodInput): ProfitAndLoss {
  let salesIncomeMinor = 0
  for (const sale of sales) {
    if (withinWindow(sale.sold_at, from, to)) salesIncomeMinor += saleTotalMinor(sale)
  }

  let orderIncomeMinor = 0
  for (const payment of payments) {
    if (withinWindow(payment.payment_date, from, to)) {
      orderIncomeMinor += signedAmountMinor(payment)
    }
  }

  let expensesMinor = 0
  const totals = new Map<ExpenseCategory, number>()
  for (const expense of expenses) {
    if (!withinWindow(expense.spent_on, from, to)) continue
    expensesMinor += expense.amount_minor
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount_minor)
  }

  const incomeMinor = salesIncomeMinor + orderIncomeMinor

  return {
    salesIncomeMinor,
    orderIncomeMinor,
    incomeMinor,
    expensesMinor,
    profitMinor: incomeMinor - expensesMinor,
    byCategory: [...totals]
      .map(([category, amountMinor]) => ({ category, amountMinor }))
      .sort((a, b) => b.amountMinor - a.amountMinor),
  }
}

export interface SoldItem {
  item: string
  quantity: number
  revenueMinor: number
}

/** Grouped case-insensitively: one product typed three ways is one row. */
export function itemsSold(sales: readonly SaleDoc[], from: string, to: string): SoldItem[] {
  const groups = new Map<string, SoldItem>()

  for (const sale of sales) {
    if (!withinWindow(sale.sold_at, from, to)) continue

    const label = sale.item_description.trim()
    const key = label.toLowerCase()
    const existing = groups.get(key)

    if (existing) {
      existing.quantity += sale.quantity
      existing.revenueMinor += saleTotalMinor(sale)
    } else {
      groups.set(key, { item: label, quantity: sale.quantity, revenueMinor: saleTotalMinor(sale) })
    }
  }

  return [...groups.values()].sort((a, b) => b.revenueMinor - a.revenueMinor)
}
