/**
 * The series the Reports charts draw.
 *
 * Every figure comes from rows on the device, bucketed here and nowhere else,
 * so a chart cannot disagree with the total printed above it. Cash accounting
 * throughout, the same as db/profit.ts: money in is money received.
 */
import { signedAmountMinor } from '../db/balances'
import { saleTotalMinor } from '../db/profit'
import { addDays, daysBetween, formatDate } from '../lib/dates'
import type { ExpenseDoc, PaymentDoc, SaleDoc } from '../db/schema'

export type Grain = 'day' | 'week' | 'month'

export interface FlowBucket {
  /** First day of the bucket, YYYY-MM-DD. */
  from: string
  /** Last day of the bucket, inclusive. */
  to: string
  /** Axis label: "13", "7 Aug", "Aug". */
  label: string
  /** What the label stands for, spoken and in the readout. */
  spanLabel: string
  inMinor: number
  outMinor: number
  netMinor: number
}

/** Days per column, so a 90-day report is 13 columns rather than 90 slivers. */
export function grainFor(from: string, to: string): Grain {
  const days = daysBetween(from, to) + 1
  if (days <= 16) return 'day'
  if (days <= 120) return 'week'
  return 'month'
}

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

function nextMonth(iso: string): string {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function shortDay(iso: string): string {
  return String(Number(iso.slice(8, 10)))
}

function shortMonth(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(5, 7)
}

/** Empty buckets spanning the window, so a quiet week is a gap and not a skip. */
export function emptyBuckets(from: string, to: string, grain: Grain): FlowBucket[] {
  const buckets: FlowBucket[] = []

  if (grain === 'month') {
    let cursor = monthStart(from)
    while (cursor <= to) {
      const next = nextMonth(cursor)
      const end = addDays(next, -1)
      buckets.push({
        from: cursor < from ? from : cursor,
        to: end > to ? to : end,
        label: shortMonth(cursor),
        spanLabel: `${shortMonth(cursor)} ${cursor.slice(0, 4)}`,
        inMinor: 0,
        outMinor: 0,
        netMinor: 0,
      })
      cursor = next
    }
    return buckets
  }

  const step = grain === 'day' ? 1 : 7
  // Anchored to the end of the window, so the last bucket is always the days
  // just gone rather than a stub nobody asked about.
  const total = daysBetween(from, to) + 1
  const count = Math.ceil(total / step)

  for (let index = count - 1; index >= 0; index -= 1) {
    const end = addDays(to, -index * step)
    const startCandidate = addDays(end, -(step - 1))
    const start = startCandidate < from ? from : startCandidate
    buckets.push({
      from: start,
      to: end,
      label: grain === 'day' ? shortDay(end) : shortDay(start),
      spanLabel:
        grain === 'day' ? formatDate(end) : `${formatDate(start)} to ${formatDate(end)}`,
      inMinor: 0,
      outMinor: 0,
      netMinor: 0,
    })
  }

  return buckets
}

export interface CashFlowInput {
  sales: readonly SaleDoc[]
  /** Scoped to this shop's orders by the caller. */
  payments: readonly PaymentDoc[]
  expenses: readonly ExpenseDoc[]
  from: string
  to: string
}

export function cashFlow({ sales, payments, expenses, from, to }: CashFlowInput): FlowBucket[] {
  const grain = grainFor(from, to)
  const buckets = emptyBuckets(from, to, grain)

  const place = (day: string): FlowBucket | undefined =>
    buckets.find((bucket) => day >= bucket.from && day <= bucket.to)

  for (const sale of sales) {
    const bucket = place(sale.sold_at.slice(0, 10))
    if (bucket) bucket.inMinor += saleTotalMinor(sale)
  }
  for (const payment of payments) {
    const bucket = place(payment.payment_date.slice(0, 10))
    // Signed, so a refund lowers money in rather than showing up as spending.
    if (bucket) bucket.inMinor += signedAmountMinor(payment)
  }
  for (const expense of expenses) {
    const bucket = place(expense.spent_on)
    if (bucket) bucket.outMinor += expense.amount_minor
  }

  for (const bucket of buckets) bucket.netMinor = bucket.inMinor - bucket.outMinor
  return buckets
}

/** Running net across the window: the line a shop reads as "am I ahead". */
export function cumulativeNet(buckets: readonly FlowBucket[]): number[] {
  let running = 0
  return buckets.map((bucket) => {
    running += bucket.netMinor
    return running
  })
}
