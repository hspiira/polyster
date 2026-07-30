import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, dueBucket, formatDueDate, today } from './dates'

describe('today', () => {
  it('uses the local calendar day, not UTC', () => {
    // 23:30 local on the 14th is still the 14th, even where that is already
    // the 15th in UTC. A shop closing its books at night must not see
    // tomorrow's orders as due today.
    expect(today(new Date(2026, 7, 14, 23, 30))).toBe('2026-08-14')
    expect(today(new Date(2026, 7, 14, 0, 5))).toBe('2026-08-14')
  })

  it('zero-pads single-digit months and days', () => {
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-08-30', 3)).toBe('2026-09-02')
  })

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('goes backwards', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('daysBetween', () => {
  it('counts forward and backward', () => {
    expect(daysBetween('2026-08-14', '2026-08-21')).toBe(7)
    expect(daysBetween('2026-08-21', '2026-08-14')).toBe(-7)
    expect(daysBetween('2026-08-14', '2026-08-14')).toBe(0)
  })

  it('is not thrown off by a daylight-saving shift', () => {
    // Computed in UTC precisely so a 23- or 25-hour local day cannot round to
    // the wrong number of days and misfile an order as overdue.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })
})

describe('dueBucket', () => {
  const from = '2026-08-14'

  it.each([
    ['2026-08-13', 'overdue'],
    ['2026-07-01', 'overdue'],
    ['2026-08-14', 'today'],
    ['2026-08-15', 'this_week'],
    ['2026-08-21', 'this_week'],
    ['2026-08-22', 'later'],
  ] as const)('puts %s in %s', (date, bucket) => {
    expect(dueBucket(date, from)).toBe(bucket)
  })

  it('treats the seventh day as this week and the eighth as later', () => {
    // The boundary is the one thing here worth pinning down: "due this week"
    // driving a dashboard section means an off-by-one hides a real order.
    expect(dueBucket(addDays(from, 7), from)).toBe('this_week')
    expect(dueBucket(addDays(from, 8), from)).toBe('later')
  })
})

describe('formatDueDate', () => {
  const from = '2026-08-14'

  it.each([
    ['2026-08-14', 'today'],
    ['2026-08-15', 'tomorrow'],
    ['2026-08-13', '1 day overdue'],
    ['2026-08-11', '3 days overdue'],
    ['2026-08-19', 'in 5 days'],
  ])('renders %s as %s', (date, expected) => {
    expect(formatDueDate(date, from)).toBe(expected)
  })

  it('falls back to a plain date once counting days stops helping', () => {
    // Asserted loosely on purpose. ICU's month abbreviations shift between
    // Node versions (en-GB renders September as both "Sep" and "Sept"
    // depending on the build), and pinning the exact string tests ICU rather
    // than this module.
    const formatted = formatDueDate('2026-09-30', from)
    expect(formatted).toMatch(/^30 \w+ 2026$/)
    expect(formatted).not.toMatch(/days/)
  })
})
