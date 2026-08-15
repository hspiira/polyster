/* Everything Today derives, as pure functions kept out of the component so they
   are testable without a harness. Nothing here imports Preact or RxDB. */
import { addDays, dueBucket } from '../../lib/dates'
import { formatMinor } from '../../lib/money'
import { needsReturn } from '../../lib/orderTypes'
import type { OrderBalance } from '../../db/balances'
import { OPEN_STAGES, type OrderDoc } from '../../db/schema'

export type HeroTone = 'muted' | 'strong' | 'alert' | 'money'

export interface HeroSegment {
  text: string
  tone: HeroTone
}

export interface HeroCounts {
  late: number
  dueToday: number
  dueThisWeek: number
  outstanding_minor: number
  /** For formatting `outstanding_minor`, which sums across orders -- the shop's, not any one order's. */
  currency: string
}

/* The hero statement as tone-tagged segments rather than a string, so the
   emphasis is data and the component stays dumb. */
export function heroSegments(counts: HeroCounts): HeroSegment[] {
  const segments: HeroSegment[] = []

  if (counts.late > 0) {
    segments.push({ text: 'You have ', tone: 'muted' })
    segments.push({ text: `${counts.late} late`, tone: 'alert' })
    if (counts.dueToday > 0) {
      segments.push({ text: ', ', tone: 'muted' })
      segments.push({ text: `${counts.dueToday} due today`, tone: 'strong' })
    }
  } else if (counts.dueToday > 0) {
    segments.push({ text: 'You have ', tone: 'muted' })
    segments.push({ text: `${counts.dueToday} due today`, tone: 'strong' })
  } else if (counts.dueThisWeek > 0) {
    segments.push({ text: 'You have ', tone: 'muted' })
    segments.push({ text: `${counts.dueThisWeek} due this week`, tone: 'strong' })
  } else {
    segments.push({ text: 'Nothing due today', tone: 'strong' })
  }

  if (counts.outstanding_minor > 0) {
    segments.push({ text: ' and ', tone: 'muted' })
    segments.push({
      text: `${formatMinor(counts.outstanding_minor, counts.currency)} owed`,
      tone: 'money',
    })
  }

  return segments
}

export interface DueRow {
  order: OrderDoc
  clientName: string
  /** A garment due out, or a rental due back. Never confuse the two on screen. */
  kind: 'pickup' | 'return'
  /** Whichever date put this row in its bucket. */
  dueDate: string
  /** Clamped at zero so an overpayment never shows as a negative. */
  outstanding_minor: number
}

export interface TodayBuckets {
  overdue: DueRow[]
  dueToday: DueRow[]
  dueThisWeek: DueRow[]
  outOnRental: DueRow[]
}

function toRow(
  order: OrderDoc,
  kind: DueRow['kind'],
  dueDate: string,
  clientNames: ReadonlyMap<string, string>,
  balances: ReadonlyMap<string, OrderBalance>,
): DueRow {
  return {
    order,
    clientName: clientNames.get(order.client_id) ?? 'Unknown client',
    kind,
    dueDate,
    outstanding_minor: Math.max(0, balances.get(order.id)?.balance_minor ?? 0),
  }
}

/** A rental that is out and has a date it is due back on. */
function isOutOnRental(order: OrderDoc): boolean {
  return (
    needsReturn(order.order_type) &&
    order.stage === 'picked_up' &&
    typeof order.return_due_date === 'string' &&
    order.return_due_date.length > 0
  )
}

/* Today's four groups. Overdue rental returns join Overdue; every other return
   goes to outOnRental, so "items that are out" has one home (N9). */
export function buildBuckets(
  orders: readonly OrderDoc[],
  clientNames: ReadonlyMap<string, string>,
  balances: ReadonlyMap<string, OrderBalance>,
  from: string,
): TodayBuckets {
  const buckets: TodayBuckets = { overdue: [], dueToday: [], dueThisWeek: [], outOnRental: [] }

  for (const order of orders) {
    if (OPEN_STAGES.includes(order.stage)) {
      const row = toRow(order, 'pickup', order.pickup_due_date, clientNames, balances)
      const bucket = dueBucket(order.pickup_due_date, from)
      if (bucket === 'overdue') buckets.overdue.push(row)
      else if (bucket === 'today') buckets.dueToday.push(row)
      else if (bucket === 'this_week') buckets.dueThisWeek.push(row)
      continue
    }

    if (!isOutOnRental(order)) continue

    const returnDate = order.return_due_date as string
    const row = toRow(order, 'return', returnDate, clientNames, balances)
    if (dueBucket(returnDate, from) === 'overdue') buckets.overdue.push(row)
    else buckets.outOnRental.push(row)
  }

  for (const rows of Object.values(buckets)) {
    rows.sort((a: DueRow, b: DueRow) => a.dueDate.localeCompare(b.dueDate))
  }

  return buckets
}

export interface DayCell {
  /** YYYY-MM-DD. */
  date: string
  weekdayInitial: string
  dayOfMonth: number
  count: number
  /** '' when empty, '99+' above the cap, otherwise the count. */
  countLabel: string
  isToday: boolean
}

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'narrow' })

/** Local Date from a YYYY-MM-DD string, the way dates.ts does it. */
function toLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

function countLabelFor(count: number): string {
  if (count === 0) return ''
  return count > 99 ? '99+' : String(count)
}

/* Seven days from `from`, each carrying its outstanding work. Informational:
   the buckets organise the screen, not this (N5, N6). */
export function buildDayStrip(orders: readonly OrderDoc[], from: string): DayCell[] {
  const counts = new Map<string, number>()
  const bump = (date: string) => counts.set(date, (counts.get(date) ?? 0) + 1)

  for (const order of orders) {
    if (OPEN_STAGES.includes(order.stage)) bump(order.pickup_due_date)
    else if (isOutOnRental(order)) bump(order.return_due_date as string)
  }

  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(from, offset)
    const count = counts.get(date) ?? 0
    return {
      date,
      weekdayInitial: WEEKDAY.format(toLocalDate(date)),
      dayOfMonth: toLocalDate(date).getDate(),
      count,
      countLabel: countLabelFor(count),
      isToday: offset === 0,
    }
  })
}

/* Every row of work falling on one date. The same rule buildDayStrip counts
   with, so a cell reading 3 cannot open a list of 5. */
export function rowsDueOn(
  orders: readonly OrderDoc[],
  clientNames: ReadonlyMap<string, string>,
  balances: ReadonlyMap<string, OrderBalance>,
  date: string,
): DueRow[] {
  const rows: DueRow[] = []

  for (const order of orders) {
    if (OPEN_STAGES.includes(order.stage)) {
      if (order.pickup_due_date === date) {
        rows.push(toRow(order, 'pickup', order.pickup_due_date, clientNames, balances))
      }
      continue
    }
    if (isOutOnRental(order) && order.return_due_date === date) {
      rows.push(toRow(order, 'return', order.return_due_date as string, clientNames, balances))
    }
  }

  return rows
}

/* Orders as plain pickup rows, for the stage-based filters -- those are about
   what an order is rather than when it is due. */
export function pickupRows(
  orders: readonly OrderDoc[],
  clientNames: ReadonlyMap<string, string>,
  balances: ReadonlyMap<string, OrderBalance>,
): DueRow[] {
  return orders.map((order) =>
    toRow(order, 'pickup', order.pickup_due_date, clientNames, balances),
  )
}

export interface OwingRow {
  order: OrderDoc
  clientName: string
  outstanding_minor: number
  /** Already out of the shop -- these are the ones worth chasing. */
  collected: boolean
}

export interface MoneySummary {
  outstanding_minor: number
  clientCount: number
  rows: OwingRow[]
}

/* What the shop is owed, and by whom. Collected-but-unpaid sorts first: an
   unpaid garment on the bench is normal, one already gone is not. */
export function buildMoneySummary(
  orders: readonly OrderDoc[],
  clientNames: ReadonlyMap<string, string>,
  balances: ReadonlyMap<string, OrderBalance>,
  limit = 3,
): MoneySummary {
  const owing: OwingRow[] = []
  const clients = new Set<string>()
  let outstanding_minor = 0

  for (const order of orders) {
    // A cancelled order is not chased for money -- excluded here, at the
    // aggregate, rather than in calculateBalance, which stays dumb.
    if (order.stage === 'cancelled') continue
    const owed = balances.get(order.id)?.balance_minor ?? 0
    if (owed <= 0) continue

    outstanding_minor += owed
    clients.add(order.client_id)
    owing.push({
      order,
      clientName: clientNames.get(order.client_id) ?? 'Unknown client',
      outstanding_minor: owed,
      collected: !OPEN_STAGES.includes(order.stage),
    })
  }

  owing.sort((a, b) => {
    if (a.collected !== b.collected) return a.collected ? -1 : 1
    return b.outstanding_minor - a.outstanding_minor
  })

  return { outstanding_minor, clientCount: clients.size, rows: owing.slice(0, limit) }
}

export interface CappedRows<T> {
  rows: T[]
  hidden: number
}

/** Today shows a few rows per section, never all of them (spec N8). */
export function capRows<T>(rows: readonly T[], limit: number): CappedRows<T> {
  return { rows: rows.slice(0, limit), hidden: Math.max(0, rows.length - limit) }
}
