import { describe, expect, it } from 'vitest'
import {
  balanceView,
  canSendBalanceReminder,
  depositView,
  isOverdue,
  isSettled,
  isStillDue,
  lastMessage,
  moneyLines,
} from './orderDetailModel'
import type { OrderBalance } from '../db/balances'
import type { MessageLogDoc, OrderDoc, StaffDoc } from '../db/schema'

function balance(patch: Partial<OrderBalance> = {}): OrderBalance {
  const price = patch.price_total_minor ?? 100000
  const paid = patch.amount_paid_minor ?? 0
  return {
    order_id: 'order-1',
    price_total_minor: price,
    amount_paid_minor: paid,
    balance_minor: price - paid,
    fully_paid: price - paid <= 0,
    ...patch,
  }
}

function order(patch: Partial<OrderDoc> = {}): OrderDoc {
  return {
    id: 'order-1',
    stage: 'measured',
    pickup_due_date: '2026-08-20',
    price_total_minor: 100000,
    price_adjustment_minor: 0,
    rental_deposit_minor: 0,
    ...patch,
  } as unknown as OrderDoc
}

describe('isStillDue', () => {
  it('is false once the garment has left', () => {
    expect(isStillDue('picked_up')).toBe(false)
    expect(isStillDue('returned')).toBe(false)
  })

  it('is true while the shop still holds it', () => {
    expect(isStillDue('measured')).toBe(true)
    expect(isStillDue('ready')).toBe(true)
  })

  // Cancelled is not "gone", so it keeps counting as due -- matching the
  // screen's behaviour before the extraction.
  it('treats cancelled as still due', () => {
    expect(isStillDue('cancelled')).toBe(true)
  })
})

describe('isOverdue', () => {
  it('is true past the pickup date', () => {
    expect(isOverdue(order({ pickup_due_date: '2026-08-10' }), '2026-08-14')).toBe(true)
  })

  it('is false on the pickup date itself', () => {
    expect(isOverdue(order({ pickup_due_date: '2026-08-14' }), '2026-08-14')).toBe(false)
  })

  // A collected order is finished business however late it was.
  it('is false once picked up, however far past the date', () => {
    expect(
      isOverdue(order({ pickup_due_date: '2020-01-01', stage: 'picked_up' }), '2026-08-14'),
    ).toBe(false)
  })
})

describe('balanceView', () => {
  it('reports money still owed', () => {
    const view = balanceView(balance({ price_total_minor: 100000, amount_paid_minor: 40000 }))
    expect(view.state).toBe('owing')
    expect(view.label).toBe('Balance due')
    expect(view.amountMinor).toBe(60000)
    expect(view.paidFraction).toBeCloseTo(0.4)
  })

  it('reports a settled order', () => {
    const view = balanceView(balance({ price_total_minor: 100000, amount_paid_minor: 100000 }))
    expect(view.state).toBe('settled')
    expect(view.label).toBe('Fully paid')
    expect(view.amountMinor).toBe(0)
  })

  it('reports an overpayment as a positive figure', () => {
    const view = balanceView(balance({ price_total_minor: 100000, amount_paid_minor: 120000 }))
    expect(view.state).toBe('overpaid')
    expect(view.amountMinor).toBe(20000)
  })

  it('never draws a bar past its track', () => {
    expect(balanceView(balance({ price_total_minor: 100, amount_paid_minor: 500 })).paidFraction).toBe(1)
  })

  // A zero-priced order would otherwise divide by zero and produce NaN, which
  // renders as a bar of no width at all rather than a full one.
  it('survives a zero-priced order', () => {
    const view = balanceView(balance({ price_total_minor: 0, amount_paid_minor: 0 }))
    expect(Number.isNaN(view.paidFraction)).toBe(false)
    expect(view.state).toBe('settled')
  })

  it('never goes negative on a refund past zero', () => {
    const view = balanceView(
      balance({ price_total_minor: 1000, amount_paid_minor: -500, balance_minor: 1500 }),
    )
    expect(view.paidFraction).toBe(0)
  })
})

describe('isSettled', () => {
  it('is false while a balance is unknown', () => {
    expect(isSettled(null)).toBe(false)
  })

  it('is true once nothing is outstanding', () => {
    expect(isSettled(balance({ price_total_minor: 100, amount_paid_minor: 100 }))).toBe(true)
  })

  it('is true when overpaid, since there is still nothing to add', () => {
    expect(isSettled(balance({ price_total_minor: 100, amount_paid_minor: 150 }))).toBe(true)
  })

  it('is false with anything left to pay', () => {
    expect(isSettled(balance({ price_total_minor: 100, amount_paid_minor: 99 }))).toBe(false)
  })
})

describe('moneyLines', () => {
  it('omits the adjustment line when there is none', () => {
    const lines = moneyLines(order(), balance())
    expect(lines.map((line) => line.label)).toEqual(['Subtotal', 'Total', 'Paid', 'Balance'])
  })

  it('recovers the subtotal by removing the adjustment', () => {
    const lines = moneyLines(
      order({ price_total_minor: 95000, price_adjustment_minor: -5000 }),
      balance({ price_total_minor: 95000 }),
    )
    expect(lines[0]).toMatchObject({ label: 'Subtotal', amountMinor: 100000 })
  })

  it('names a discount and a charge when no reason was given', () => {
    const discount = moneyLines(order({ price_adjustment_minor: -1 }), balance())
    const charge = moneyLines(order({ price_adjustment_minor: 1 }), balance())
    expect(discount[1]?.label).toBe('Discount')
    expect(charge[1]?.label).toBe('Extra charge')
  })

  it('prefers the reason the shop gave', () => {
    const lines = moneyLines(
      order({ price_adjustment_minor: -5000, adjustment_reason: 'Regular customer' }),
      balance(),
    )
    expect(lines[1]?.label).toBe('Regular customer')
  })
})

describe('depositView', () => {
  it('is absent when nothing is held', () => {
    expect(depositView(order())).toBeNull()
  })

  it('is refundable while unrefunded', () => {
    const view = depositView(order({ rental_deposit_minor: 20000 }))
    expect(view).toMatchObject({ heldMinor: 20000, refundable: true })
  })

  it('stops being refundable once refunded', () => {
    const view = depositView(
      order({ rental_deposit_minor: 20000, deposit_refunded_at: '2026-08-12T10:00:00Z' }),
    )
    expect(view?.refundable).toBe(false)
    expect(view?.refundedAt).toBe('2026-08-12T10:00:00Z')
  })
})

describe('canSendBalanceReminder', () => {
  const owed = balance({ price_total_minor: 100, amount_paid_minor: 0 })

  it('is offered on an overdue order with money outstanding', () => {
    expect(canSendBalanceReminder({ overdue: true, balance: owed, hasLink: true })).toBe(true)
  })

  it('is withheld when nothing is owed', () => {
    const paid = balance({ price_total_minor: 100, amount_paid_minor: 100 })
    expect(canSendBalanceReminder({ overdue: true, balance: paid, hasLink: true })).toBe(false)
  })

  it('is withheld when the order is not overdue', () => {
    expect(canSendBalanceReminder({ overdue: false, balance: owed, hasLink: true })).toBe(false)
  })

  it('is withheld with no reachable number', () => {
    expect(canSendBalanceReminder({ overdue: true, balance: owed, hasLink: false })).toBe(false)
  })
})

describe('lastMessage', () => {
  const staff = [{ id: 'staff-1', name: 'Achen' }] as unknown as StaffDoc[]
  const log = (patch: Partial<MessageLogDoc>) =>
    ({ template: 'stage_update', sent_at: '2026-08-12T10:00:00Z', ...patch }) as MessageLogDoc

  it('is absent when nothing has been sent', () => {
    expect(lastMessage([], staff)).toBeNull()
  })

  it('names the sender when one is attributed', () => {
    expect(lastMessage([log({ sent_by: 'staff-1' })], staff)?.senderName).toBe('Achen')
  })

  it('omits a sender who is no longer on the device', () => {
    expect(lastMessage([log({ sent_by: 'gone' })], staff)?.senderName).toBeUndefined()
  })

  // The distinction the screen exists to preserve: a stage update is not a chase.
  it('calls only a balance reminder a reminder', () => {
    expect(lastMessage([log({ template: 'balance_reminder' })], staff)?.label).toBe('Reminder sent')
    expect(lastMessage([log({ template: 'stage_update' })], staff)?.label).toBe('Update sent')
  })

  it('takes the first log, which the query sorts newest first', () => {
    const logs = [log({ template: 'custom' }), log({ template: 'balance_reminder' })]
    expect(lastMessage(logs, staff)?.label).toBe('Message sent')
  })
})
