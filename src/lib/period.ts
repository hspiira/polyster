/**
 * The window every money screen reports on.
 *
 * One definition so Sales, Money and Reports cannot disagree about what "30D"
 * means -- a shop comparing two of them would find the discrepancy first.
 */
import { addDays, daysBetween, formatDate, today } from './dates'

export type PeriodKey = '7' | '30' | '90' | 'custom'

export const PERIOD_OPTIONS: readonly { value: PeriodKey; label: string }[] = [
  { value: '7', label: '7D' },
  { value: '30', label: '30D' },
  { value: '90', label: '90D' },
  { value: 'custom', label: 'Customise' },
]

export interface PeriodRange {
  /** Inclusive ISO date, YYYY-MM-DD. */
  from: string
  /** Inclusive ISO date, YYYY-MM-DD. */
  to: string
}

/** Inclusive of today, which is why a 7-day window reaches 6 days back. */
export function periodRange(
  key: PeriodKey,
  now: string = today(),
  custom?: Partial<PeriodRange>,
): PeriodRange {
  if (key === 'custom') {
    const from = custom?.from || now
    const to = custom?.to || now
    return from <= to ? { from, to } : { from: to, to: from }
  }
  return { from: addDays(now, -(Number(key) - 1)), to: now }
}

/** How a screen refers to the window in a sentence: "last 30 days". */
export function periodLabel(key: PeriodKey, range: PeriodRange): string {
  if (key !== 'custom') return `last ${key} days`
  if (range.from === range.to) return formatDate(range.from)
  return `${formatDate(range.from)} to ${formatDate(range.to)}`
}

/** Days covered, inclusive of both ends. */
export function periodDays(range: PeriodRange): number {
  return daysBetween(range.from, range.to) + 1
}
