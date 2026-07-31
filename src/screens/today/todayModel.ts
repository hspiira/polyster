/**
 * Everything the Today screen derives, as pure functions.
 *
 * Kept out of the component so it is testable without a component-test
 * harness -- the same reason orderStage.ts exists. Nothing here imports Preact
 * or RxDB.
 */
import { dueBucket } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import type { OrderBalance } from '../../db/balances'
import type { OrderStage, OrderDoc } from '../../db/schema'

/** Stages that still need something doing. Finished work is not "due". */
export const OPEN_STAGES: readonly OrderStage[] = ['measured', 'in_progress', 'ready']

export type HeroTone = 'muted' | 'strong' | 'alert' | 'money'

export interface HeroSegment {
  text: string
  tone: HeroTone
}

export interface HeroCounts {
  late: number
  dueToday: number
  dueThisWeek: number
  outstanding: number
}

/**
 * The hero statement, as tone-tagged segments rather than a string, so the
 * emphasis is data and the component stays dumb.
 */
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

  if (counts.outstanding > 0) {
    segments.push({ text: ' and ', tone: 'muted' })
    segments.push({ text: `${formatMoney(counts.outstanding)} owed`, tone: 'money' })
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
  outstanding: number
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
    outstanding: Math.max(0, balances.get(order.id)?.balance ?? 0),
  }
}

/** A rental that is out and has a date it is due back on. */
function isOutOnRental(order: OrderDoc): boolean {
  return (
    order.order_type === 'rental' &&
    order.stage === 'picked_up' &&
    typeof order.return_due_date === 'string' &&
    order.return_due_date.length > 0
  )
}

/**
 * Today's four groups. Overdue rental returns join Overdue; every other return
 * goes to outOnRental, so "items that are out" has one home (spec N9).
 */
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
