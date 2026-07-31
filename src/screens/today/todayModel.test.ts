import { describe, expect, it } from 'vitest'
import { heroSegments } from './todayModel'
import { formatMoney } from '../../lib/money'

const NONE = { late: 0, dueToday: 0, dueThisWeek: 0, outstanding: 0 }

describe('heroSegments', () => {
  it('leads with late work and names today alongside it', () => {
    const segments = heroSegments({ ...NONE, late: 2, dueToday: 3 })
    expect(segments).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '2 late', tone: 'alert' },
      { text: ', ', tone: 'muted' },
      { text: '3 due today', tone: 'strong' },
    ])
  })

  it('reports late work alone when nothing else is due', () => {
    expect(heroSegments({ ...NONE, late: 1 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '1 late', tone: 'alert' },
    ])
  })

  it('reports today when nothing is late', () => {
    expect(heroSegments({ ...NONE, dueToday: 3 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '3 due today', tone: 'strong' },
    ])
  })

  it('falls back to the week when nothing is late or due today', () => {
    expect(heroSegments({ ...NONE, dueThisWeek: 4 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '4 due this week', tone: 'strong' },
    ])
  })

  it('says nothing is due when no work is outstanding', () => {
    expect(heroSegments(NONE)).toEqual([{ text: 'Nothing due today', tone: 'strong' }])
  })

  // The money clause attaches with "and"; the work clause uses a comma, so no
  // sentence ever carries two "and"s.
  it('appends the money clause when something is owed', () => {
    const segments = heroSegments({ ...NONE, late: 2, dueToday: 3, outstanding: 240_000 })
    expect(segments.slice(-2)).toEqual([
      { text: ' and ', tone: 'muted' },
      { text: `${formatMoney(240_000)} owed`, tone: 'money' },
    ])
  })

  it('omits the money clause when nothing is owed', () => {
    expect(heroSegments({ ...NONE, dueToday: 1 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '1 due today', tone: 'strong' },
    ])
  })

  it('reads sensibly when money is owed but no work is due', () => {
    expect(heroSegments({ ...NONE, outstanding: 5000 })).toEqual([
      { text: 'Nothing due today', tone: 'strong' },
      { text: ' and ', tone: 'muted' },
      { text: `${formatMoney(5000)} owed`, tone: 'money' },
    ])
  })

  // An overpaid order produces a negative balance. It must never surface as a
  // negative figure in the hero.
  it('ignores a non-positive outstanding total', () => {
    expect(heroSegments({ ...NONE, dueToday: 1, outstanding: -500 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '1 due today', tone: 'strong' },
    ])
  })
})

import { buildBuckets } from './todayModel'
import type { OrderBalance } from '../../db/balances'
import type { OrderDoc } from '../../db/schema'

const TODAY = '2026-07-31'

function order(overrides: Partial<OrderDoc> & { id: string }): OrderDoc {
  return {
    shop_id: 'shop-1',
    client_id: 'client-1',
    order_type: 'tailor_made',
    item_description: 'Navy suit',
    stage: 'in_progress',
    price_total: 100_000,
    pickup_due_date: TODAY,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

const NAMES = new Map([['client-1', 'Achen Josephine']])
const NO_BALANCES = new Map<string, OrderBalance>()

describe('buildBuckets', () => {
  it('buckets open pickups by due date and drops anything further out', () => {
    const buckets = buildBuckets(
      [
        order({ id: 'late', pickup_due_date: '2026-07-28' }),
        order({ id: 'today', pickup_due_date: TODAY }),
        order({ id: 'week', pickup_due_date: '2026-08-03' }),
        order({ id: 'later', pickup_due_date: '2026-09-01' }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )

    expect(buckets.overdue.map((row) => row.order.id)).toEqual(['late'])
    expect(buckets.dueToday.map((row) => row.order.id)).toEqual(['today'])
    expect(buckets.dueThisWeek.map((row) => row.order.id)).toEqual(['week'])
    expect(buckets.outOnRental).toEqual([])
  })

  it('excludes finished work from the pickup buckets', () => {
    const buckets = buildBuckets(
      [
        order({ id: 'gone', stage: 'picked_up', pickup_due_date: '2026-07-20' }),
        order({ id: 'back', stage: 'returned', pickup_due_date: '2026-07-20' }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.overdue).toEqual([])
  })

  // T1: this is the case that appears on no screen today.
  it('puts an overdue rental return in Overdue, marked as a return', () => {
    const buckets = buildBuckets(
      [
        order({
          id: 'tux',
          order_type: 'rental',
          stage: 'picked_up',
          pickup_due_date: '2026-07-10',
          return_due_date: '2026-07-29',
        }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )

    expect(buckets.overdue).toHaveLength(1)
    expect(buckets.overdue[0]?.kind).toBe('return')
    expect(buckets.overdue[0]?.dueDate).toBe('2026-07-29')
    expect(buckets.outOnRental).toEqual([])
  })

  it('puts a return due today on Out on rental, not in Due today', () => {
    const buckets = buildBuckets(
      [
        order({
          id: 'gown',
          order_type: 'rental',
          stage: 'picked_up',
          return_due_date: TODAY,
        }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )

    expect(buckets.dueToday).toEqual([])
    expect(buckets.outOnRental.map((row) => row.order.id)).toEqual(['gown'])
  })

  it('puts a future return on Out on rental', () => {
    const buckets = buildBuckets(
      [
        order({
          id: 'gown',
          order_type: 'rental',
          stage: 'picked_up',
          return_due_date: '2026-09-15',
        }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.outOnRental.map((row) => row.order.id)).toEqual(['gown'])
  })

  it('ignores a picked-up rental with no return date', () => {
    const buckets = buildBuckets(
      [order({ id: 'gown', order_type: 'rental', stage: 'picked_up' })],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.outOnRental).toEqual([])
    expect(buckets.overdue).toEqual([])
  })

  // OrderForm rejects this, so it can only arrive by replication from another
  // client. Overdue is the honest reading of a return date already in the past.
  it('buckets a return date earlier than its pickup date as overdue', () => {
    const buckets = buildBuckets(
      [
        order({
          id: 'muddle',
          order_type: 'rental',
          stage: 'picked_up',
          pickup_due_date: '2026-07-25',
          return_due_date: '2026-07-20',
        }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.overdue.map((row) => row.order.id)).toEqual(['muddle'])
  })

  it('ignores a return date on a non-rental order', () => {
    const buckets = buildBuckets(
      [order({ id: 'suit', stage: 'picked_up', return_due_date: '2026-07-20' })],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.overdue).toEqual([])
    expect(buckets.outOnRental).toEqual([])
  })

  it('ignores a returned rental even with an overdue return date', () => {
    const buckets = buildBuckets(
      [order({ id: 'back', order_type: 'rental', stage: 'returned', return_due_date: '2026-07-20' })],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.overdue).toEqual([])
    expect(buckets.outOnRental).toEqual([])
  })

  it('sorts each bucket by the date it is due on', () => {
    const buckets = buildBuckets(
      [
        order({ id: 'b', pickup_due_date: '2026-07-25' }),
        order({ id: 'a', pickup_due_date: '2026-07-20' }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.overdue.map((row) => row.order.id)).toEqual(['a', 'b'])
  })

  it('carries the client name and the outstanding balance', () => {
    const balances = new Map<string, OrderBalance>([
      ['today', { order_id: 'today', price_total: 100_000, amount_paid: 40_000, balance: 60_000, fully_paid: false }],
    ])
    const buckets = buildBuckets([order({ id: 'today' })], NAMES, balances, TODAY)

    expect(buckets.dueToday[0]?.clientName).toBe('Achen Josephine')
    expect(buckets.dueToday[0]?.outstanding).toBe(60_000)
  })

  it('falls back for a client that has not synced, rather than hiding the row', () => {
    const buckets = buildBuckets(
      [order({ id: 'today', client_id: 'missing' })],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.dueToday[0]?.clientName).toBe('Unknown client')
  })

  it('reports an overpaid order as owing nothing', () => {
    const balances = new Map<string, OrderBalance>([
      ['today', { order_id: 'today', price_total: 100_000, amount_paid: 120_000, balance: -20_000, fully_paid: true }],
    ])
    const buckets = buildBuckets([order({ id: 'today' })], NAMES, balances, TODAY)
    expect(buckets.dueToday[0]?.outstanding).toBe(0)
  })
})

import { buildDayStrip } from './todayModel'

describe('buildDayStrip', () => {
  it('returns seven cells rolling forward from today', () => {
    const cells = buildDayStrip([], TODAY)
    expect(cells).toHaveLength(7)
    expect(cells[0]?.date).toBe('2026-07-31')
    expect(cells[0]?.isToday).toBe(true)
    expect(cells[6]?.date).toBe('2026-08-06')
    expect(cells[6]?.isToday).toBe(false)
  })

  it('labels each cell with its weekday initial and day of month', () => {
    const cells = buildDayStrip([], TODAY)
    // 2026-07-31 is a Friday.
    expect(cells[0]?.weekdayInitial).toBe('F')
    expect(cells[0]?.dayOfMonth).toBe(31)
    expect(cells[1]?.dayOfMonth).toBe(1)
  })

  it('counts open pickups on their due day', () => {
    const cells = buildDayStrip(
      [
        order({ id: 'a', pickup_due_date: TODAY }),
        order({ id: 'b', pickup_due_date: TODAY }),
        order({ id: 'c', pickup_due_date: '2026-08-02' }),
      ],
      TODAY,
    )
    expect(cells[0]?.count).toBe(2)
    expect(cells[2]?.count).toBe(1)
  })

  it('counts rental returns as work on the day they are due back', () => {
    const cells = buildDayStrip(
      [
        order({
          id: 'tux',
          order_type: 'rental',
          stage: 'picked_up',
          pickup_due_date: '2026-07-01',
          return_due_date: '2026-08-02',
        }),
      ],
      TODAY,
    )
    expect(cells[2]?.count).toBe(1)
  })

  it('counts a pickup and a return falling on the same day together', () => {
    const cells = buildDayStrip(
      [
        order({ id: 'a', pickup_due_date: '2026-08-02' }),
        order({
          id: 'tux',
          order_type: 'rental',
          stage: 'picked_up',
          pickup_due_date: '2026-07-01',
          return_due_date: '2026-08-02',
        }),
      ],
      TODAY,
    )
    expect(cells[2]?.count).toBe(2)
  })

  it('includes work on the last day of the seven-day window', () => {
    const cells = buildDayStrip([order({ id: 'a', pickup_due_date: '2026-08-06' })], TODAY)
    expect(cells[6]?.count).toBe(1)
  })

  it('ignores work on the first day past the seven-day window', () => {
    const cells = buildDayStrip([order({ id: 'a', pickup_due_date: '2026-08-07' })], TODAY)
    expect(cells.every((cell) => cell.count === 0)).toBe(true)
  })

  it('ignores work outside the seven-day window', () => {
    const cells = buildDayStrip([order({ id: 'a', pickup_due_date: '2026-09-30' })], TODAY)
    expect(cells.every((cell) => cell.count === 0)).toBe(true)
  })

  it('ignores overdue work, which the buckets already carry', () => {
    const cells = buildDayStrip([order({ id: 'a', pickup_due_date: '2026-07-01' })], TODAY)
    expect(cells.every((cell) => cell.count === 0)).toBe(true)
  })

  // A row of zeroes reads as breakage, so an empty day has no number at all.
  it('renders an empty day as a blank label, not a zero', () => {
    expect(buildDayStrip([], TODAY)[0]?.countLabel).toBe('')
  })

  it('caps the label at 99+ because three digits do not fit the cell', () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      order({ id: `o-${i}`, pickup_due_date: TODAY }),
    )
    const cells = buildDayStrip(many, TODAY)
    expect(cells[0]?.count).toBe(120)
    expect(cells[0]?.countLabel).toBe('99+')
  })
})

import { buildMoneySummary, capRows } from './todayModel'

function balance(id: string, owed: number): [string, OrderBalance] {
  return [
    id,
    { order_id: id, price_total: 100_000, amount_paid: 100_000 - owed, balance: owed, fully_paid: owed <= 0 },
  ]
}

describe('buildMoneySummary', () => {
  it('totals what is outstanding across the shop', () => {
    const summary = buildMoneySummary(
      [order({ id: 'a' }), order({ id: 'b' })],
      NAMES,
      new Map([balance('a', 60_000), balance('b', 40_000)]),
    )
    expect(summary.outstanding).toBe(100_000)
  })

  it('excludes fully paid and overpaid orders from the total', () => {
    const summary = buildMoneySummary(
      [order({ id: 'a' }), order({ id: 'b' }), order({ id: 'c' })],
      NAMES,
      new Map([balance('a', 60_000), balance('b', 0), balance('c', -5_000)]),
    )
    expect(summary.outstanding).toBe(60_000)
    expect(summary.rows.map((row) => row.order.id)).toEqual(['a'])
  })

  it('counts the distinct clients owing, not the orders', () => {
    const summary = buildMoneySummary(
      [
        order({ id: 'a', client_id: 'client-1' }),
        order({ id: 'b', client_id: 'client-1' }),
        order({ id: 'c', client_id: 'client-2' }),
      ],
      NAMES,
      new Map([balance('a', 10_000), balance('b', 10_000), balance('c', 10_000)]),
    )
    expect(summary.clientCount).toBe(2)
  })

  // Money owed on a garment still being made is normal. Money owed on one
  // already collected is what a shop chases, so it sorts first.
  it('puts collected orders first, then sorts by amount owed', () => {
    const summary = buildMoneySummary(
      [
        order({ id: 'making-big', stage: 'in_progress' }),
        order({ id: 'collected-small', stage: 'picked_up' }),
        order({ id: 'collected-big', stage: 'picked_up' }),
      ],
      NAMES,
      new Map([
        balance('making-big', 90_000),
        balance('collected-small', 10_000),
        balance('collected-big', 50_000),
      ]),
    )
    expect(summary.rows.map((row) => row.order.id)).toEqual([
      'collected-big',
      'collected-small',
      'making-big',
    ])
    expect(summary.rows[0]?.collected).toBe(true)
    expect(summary.rows[2]?.collected).toBe(false)
  })

  it('limits the rows it returns', () => {
    const summary = buildMoneySummary(
      [order({ id: 'a' }), order({ id: 'b' }), order({ id: 'c' })],
      NAMES,
      new Map([balance('a', 30_000), balance('b', 20_000), balance('c', 10_000)]),
      2,
    )
    expect(summary.rows).toHaveLength(2)
    expect(summary.outstanding).toBe(60_000)
  })

  it('counts all distinct clients owing even when rows are capped', () => {
    const summary = buildMoneySummary(
      [
        order({ id: 'a', client_id: 'client-1' }),
        order({ id: 'b', client_id: 'client-2' }),
        order({ id: 'c', client_id: 'client-3' }),
        order({ id: 'd', client_id: 'client-4' }),
        order({ id: 'e', client_id: 'client-1' }),
      ],
      NAMES,
      new Map([
        balance('a', 50_000),
        balance('b', 40_000),
        balance('c', 30_000),
        balance('d', 20_000),
        balance('e', 10_000),
      ]),
      2,
    )
    expect(summary.rows).toHaveLength(2)
    expect(summary.clientCount).toBe(4)
    expect(summary.outstanding).toBe(150_000)
  })

  it('respects the default limit of 3 when not specified', () => {
    const summary = buildMoneySummary(
      [
        order({ id: 'a' }),
        order({ id: 'b' }),
        order({ id: 'c' }),
        order({ id: 'd' }),
      ],
      NAMES,
      new Map([balance('a', 40_000), balance('b', 30_000), balance('c', 20_000), balance('d', 10_000)]),
    )
    expect(summary.rows).toHaveLength(3)
    expect(summary.outstanding).toBe(100_000)
  })

  it('reports nothing owed on an empty shop', () => {
    const summary = buildMoneySummary([], NAMES, NO_BALANCES)
    expect(summary).toEqual({ outstanding: 0, clientCount: 0, rows: [] })
  })
})

describe('capRows', () => {
  it('returns everything when under the limit', () => {
    expect(capRows([1, 2, 3], 4)).toEqual({ rows: [1, 2, 3], hidden: 0 })
  })

  it('trims to the limit and reports how many are hidden', () => {
    expect(capRows([1, 2, 3, 4, 5, 6], 4)).toEqual({ rows: [1, 2, 3, 4], hidden: 2 })
  })

  it('handles an exact fit', () => {
    expect(capRows([1, 2], 2)).toEqual({ rows: [1, 2], hidden: 0 })
  })

  it('handles an empty list', () => {
    expect(capRows([], 4)).toEqual({ rows: [], hidden: 0 })
  })
})

import { pickupRows, rowsDueOn } from './todayModel'

// These back the order list's `?due=` and stage-based scopes. They exist so the
// list a day-strip cell opens is derived by the same rule that produced the
// number on the cell.
describe('rowsDueOn', () => {
  it('returns open pickups falling on the date', () => {
    const rows = rowsDueOn(
      [
        order({ id: 'a', pickup_due_date: TODAY }),
        order({ id: 'b', pickup_due_date: '2026-08-05' }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(rows.map((row) => [row.order.id, row.kind])).toEqual([['a', 'pickup']])
  })

  it('returns rentals due back on the date, marked as returns', () => {
    const rows = rowsDueOn(
      [
        order({
          id: 'out',
          order_type: 'rental',
          stage: 'picked_up',
          pickup_due_date: '2026-07-20',
          return_due_date: TODAY,
        }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(rows.map((row) => [row.order.id, row.kind, row.dueDate])).toEqual([
      ['out', 'return', TODAY],
    ])
  })

  // The early exit for open stages is the subtle part: an order still in the
  // shop is counted by its pickup date only, never twice.
  it('counts an open rental by its pickup date alone', () => {
    const rental = order({
      id: 'open-rental',
      order_type: 'rental',
      stage: 'ready',
      pickup_due_date: TODAY,
      return_due_date: TODAY,
    })
    const rows = rowsDueOn([rental], NAMES, NO_BALANCES, TODAY)
    expect(rows.map((row) => row.kind)).toEqual(['pickup'])
  })

  it('excludes a picked-up rental with no return date', () => {
    const rows = rowsDueOn(
      [order({ id: 'no-return', order_type: 'rental', stage: 'picked_up' })],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(rows).toEqual([])
  })

  it('excludes finished work entirely', () => {
    const rows = rowsDueOn(
      [order({ id: 'done', stage: 'picked_up', pickup_due_date: TODAY })],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(rows).toEqual([])
  })
})

describe('pickupRows', () => {
  it('maps every order to a pickup row regardless of stage', () => {
    const rows = pickupRows(
      [order({ id: 'a' }), order({ id: 'b', stage: 'returned' })],
      NAMES,
      NO_BALANCES,
    )
    expect(rows.map((row) => [row.order.id, row.kind])).toEqual([
      ['a', 'pickup'],
      ['b', 'pickup'],
    ])
  })

  it('clamps an overpayment to zero rather than showing a negative', () => {
    const balances = new Map<string, OrderBalance>([
      [
        'a',
        {
          order_id: 'a',
          price_total: 100_000,
          amount_paid: 120_000,
          balance: -20_000,
          fully_paid: true,
        },
      ],
    ])
    expect(pickupRows([order({ id: 'a' })], NAMES, balances)[0]?.outstanding).toBe(0)
  })
})
