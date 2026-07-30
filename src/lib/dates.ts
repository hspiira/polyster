/**
 * Date handling for due dates.
 *
 * `orders.pickup_due_date` is a Postgres `date`, not a timestamp -- a garment
 * is due on a day, not at an instant. So these are plain `YYYY-MM-DD` strings
 * throughout, compared as strings, which sorts correctly and has no timezone
 * behaviour to get wrong.
 *
 * The one place a timezone matters is deciding what "today" is, and that is
 * deliberately the device's local day. A shop in Kampala closing its books at
 * 6pm cares about the local calendar, not UTC.
 */

/** Today as YYYY-MM-DD, in the device's timezone. */
export function today(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** A date N days from the given day, as YYYY-MM-DD. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
  date.setDate(date.getDate() + days)
  return today(date)
}

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const parse = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number)
    return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)
  }
  return Math.round((parse(to) - parse(from)) / 86_400_000)
}

export type DueBucket = 'overdue' | 'today' | 'this_week' | 'later'

/**
 * Which urgency bucket a due date falls into. Drives the dashboard sections
 * and the colour of a due-date chip.
 *
 * "This week" is the next seven days rather than the remainder of the calendar
 * week: a shop looking at a Saturday order on a Friday wants it flagged, and
 * "due in the next week" is what people mean when they ask.
 */
export function dueBucket(dueDate: string, from: string = today()): DueBucket {
  const days = daysBetween(from, dueDate)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 7) return 'this_week'
  return 'later'
}

const DISPLAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** A due date as "14 Aug 2026". */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  return DISPLAY.format(new Date(year, month - 1, day))
}

/**
 * A due date in the terms a shop actually uses out loud: "today",
 * "3 days overdue", "in 5 days". Falls back to the date once it is far enough
 * away that counting days stops being useful.
 */
export function formatDueDate(isoDate: string, from: string = today()): string {
  const days = daysBetween(from, isoDate)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return '1 day overdue'
  if (days < 0) return `${Math.abs(days)} days overdue`
  if (days <= 7) return `in ${days} days`
  return formatDate(isoDate)
}

/** A timestamp as "14 Aug 2026, 09:15". Used for payments and audit rows. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${DISPLAY.format(date)}, ${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}
