/* Due dates are plain YYYY-MM-DD strings, compared as strings: a garment is due
   on a day, not at an instant. "Today" is the device's local day, not UTC. */

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

/* Which urgency bucket a due date falls into. "This week" is the next seven
   days, not the rest of the calendar week -- that is what people mean. */
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

/* A due date as a shop says it out loud: "today", "3 days overdue". Falls back
   to the date once counting days stops being useful. */
export function formatDueDate(isoDate: string, from: string = today()): string {
  const days = daysBetween(from, isoDate)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return '1 day overdue'
  if (days < 0) return `${Math.abs(days)} days overdue`
  if (days <= 7) return `in ${days} days`
  return formatDate(isoDate)
}

/** The clock part of a timestamp, as "09:15". */
export function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

/** A timestamp as "14 Aug 2026, 09:15". Used for payments and audit rows. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${DISPLAY.format(date)}, ${formatTime(iso)}`
}

/* A past day the way a shop says it: "Today", "Yesterday", then the date.
   The mirror of formatDueDate, which looks forwards. */
export function formatPastDay(isoDate: string, from: string = today()): string {
  const days = daysBetween(isoDate, from)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return formatDate(isoDate)
}
