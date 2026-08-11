/**
 * Shop-level profit and loss, derived locally.
 *
 * Closes deferred limitation 5 from the order-units design: "A shop tracking
 * money in but not out has half a picture." The pilot shop then asked for the
 * other half by name -- "Profits", "Expense", "Track what's sold".
 *
 * ## Cash accounting, on purpose
 *
 * Money in is money *received* -- sales, plus payments actually taken against
 * orders. Deliberately not the value of orders written up. A shop with
 * 2,000,000 of unpaid orders on the books has not earned 2,000,000, and a
 * profit figure that says otherwise is worse than no profit figure at all.
 * What is owed stays reported as owed, on Reports, separately.
 *
 * It also means every figure here matches what the shop can count in the till,
 * which is the only version they can check by hand -- and a pilot user who
 * cannot check a number by hand will not trust it.
 *
 * ## Why sales count whole and orders do not
 *
 * A sale is paid in full by definition (0006_sales_and_expenses.sql), so its
 * line total *is* cash received. An order is not, so only its `payments` rows
 * count. Counting an order's `price_total_minor` here would double-count every
 * order that is both written up and paid.
 *
 * Refunds are handled by `signedAmountMinor`, the same helper the order
 * balance and the Reports totals use, so a refund reduces income everywhere
 * rather than in two places out of three.
 *
 * All amounts in and out are integer minor units. Nothing here converts to a
 * major unit; `formatMinor` at the render boundary is the only place that
 * happens.
 */
import { signedAmountMinor } from './balances'
import type { ExpenseCategory, ExpenseDoc, PaymentDoc, SaleDoc } from './schema'

export interface ProfitAndLoss {
  /** Cash from sales at the counter. */
  salesIncomeMinor: number
  /** Cash from payments against orders, net of refunds. */
  orderIncomeMinor: number
  incomeMinor: number
  expensesMinor: number
  /** income - expenses. Negative is a loss, and is shown as one. */
  profitMinor: number
  byCategory: { category: ExpenseCategory; amountMinor: number }[]
}

/** Line total for a sale. Never stored, so the two can never disagree. */
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

/**
 * Timestamps are sliced to their date part rather than parsed. `sold_at` and
 * `payment_date` are ISO-8601, `spent_on` is already a plain date, and
 * comparing the leading YYYY-MM-DD as strings orders identically to comparing
 * dates with no timezone reinterpretation on the way through -- the same
 * reasoning as lib/dates.ts.
 */
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

/**
 * What sold, grouped by item, best-selling first.
 *
 * Grouped case-insensitively on trimmed text, because "Kitenge shirt" and
 * "kitenge shirt " are one product to a shop and two rows to a computer. The
 * first spelling seen wins as the label -- picking one beats showing both.
 *
 * Counts sales only. An order is bespoke work, not stock moving off a shelf,
 * and rolling the two together would answer neither question.
 */
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
