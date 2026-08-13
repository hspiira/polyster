/* What the order detail screen derives, as pure functions. The payment rules
   themselves live in lib/payments.ts; this is what the screen does with them. */
import { dueBucket, today } from '../lib/dates'
import { outstandingMinor } from '../lib/payments'
import type { OrderBalance } from '../db/balances'
import type { MessageLogDoc, MessageTemplate, OrderDoc, StaffDoc } from '../db/schema'

/* An order still due is one nobody has taken away yet. A picked-up or returned
   order cannot be overdue, however far past its date it is. */
export function isStillDue(stage: OrderDoc['stage']): boolean {
  return stage !== 'picked_up' && stage !== 'returned'
}

export function isOverdue(order: OrderDoc, from: string = today()): boolean {
  return isStillDue(order.stage) && dueBucket(order.pickup_due_date, from) === 'overdue'
}

export type BalanceState = 'owing' | 'overpaid' | 'settled'

export interface BalanceView {
  state: BalanceState
  label: string
  /** Always positive -- the state carries the direction, so the figure need not. */
  amountMinor: number
  paidMinor: number
  totalMinor: number
  /** Clamped to 0..1, so an overpayment cannot draw a bar past its track. */
  paidFraction: number
}

export function balanceView(balance: OrderBalance): BalanceView {
  const state: BalanceState =
    balance.balance_minor > 0 ? 'owing' : balance.balance_minor < 0 ? 'overpaid' : 'settled'
  return {
    state,
    label: state === 'owing' ? 'Balance due' : state === 'overpaid' ? 'Overpaid' : 'Fully paid',
    amountMinor: Math.abs(balance.balance_minor),
    paidMinor: balance.amount_paid_minor,
    totalMinor: balance.price_total_minor,
    // `|| 1` guards a zero-priced order, which would otherwise divide by zero.
    paidFraction: Math.min(
      1,
      Math.max(0, balance.amount_paid_minor / (balance.price_total_minor || 1)),
    ),
  }
}

/** Nothing owed means nothing to add, so the form is replaced by a statement. */
export function isSettled(balance: OrderBalance | null): boolean {
  if (!balance) return false
  return outstandingMinor(balance.price_total_minor, balance.amount_paid_minor) <= 0
}

export interface MoneyLine {
  label: string
  amountMinor: number
  /** Rendered with an explicit sign, because an adjustment reads either way. */
  signed?: boolean
}

/* Subtotal, adjustment, total, paid, balance. The adjustment line is omitted
   when there is none, rather than shown as a zero. */
export function moneyLines(order: OrderDoc, balance: OrderBalance): MoneyLine[] {
  const adjustment = order.price_adjustment_minor
  return [
    { label: 'Subtotal', amountMinor: order.price_total_minor - adjustment },
    ...(adjustment !== 0
      ? [
          {
            label: order.adjustment_reason ?? (adjustment < 0 ? 'Discount' : 'Extra charge'),
            amountMinor: adjustment,
            signed: true,
          },
        ]
      : []),
    { label: 'Total', amountMinor: order.price_total_minor },
    { label: 'Paid', amountMinor: balance.amount_paid_minor },
    { label: 'Balance', amountMinor: balance.balance_minor },
  ]
}

export interface DepositView {
  heldMinor: number
  refundedAt?: string
  refundable: boolean
}

/* A deposit is held, not earned, so it never joins the balance. Null when the
   order has none, which is every type but rental. */
export function depositView(order: OrderDoc): DepositView | null {
  if (order.rental_deposit_minor <= 0) return null
  return {
    heldMinor: order.rental_deposit_minor,
    refundedAt: order.deposit_refunded_at,
    refundable: !order.deposit_refunded_at,
  }
}

/* A reminder is about money, so it needs money to be outstanding and a way to
   send it. Offered on an overdue order only -- otherwise it is a chase. */
export function canSendBalanceReminder({
  overdue,
  balance,
  hasLink,
}: {
  overdue: boolean
  balance: OrderBalance
  hasLink: boolean
}): boolean {
  return overdue && balance.balance_minor > 0 && hasLink
}

/* Only 'balance_reminder' is a reminder. Labelling a stage update as one would
   tell staff a client had been chased about money when they had not. */
export const MESSAGE_SENT_LABEL: Record<MessageTemplate, string> = {
  balance_reminder: 'Reminder sent',
  stage_update: 'Update sent',
  custom: 'Message sent',
}

export interface LastMessage {
  label: string
  sentAt: string
  senderName?: string
}

/* The most recent message, named. Never "notified": a wa.me link records that
   WhatsApp was opened, not that anything arrived. */
export function lastMessage(
  logs: readonly MessageLogDoc[],
  staff: readonly StaffDoc[],
): LastMessage | null {
  const latest = logs[0]
  if (!latest) return null
  const sender = latest.sent_by
    ? staff.find((member) => member.id === latest.sent_by)?.name
    : undefined
  return {
    label: MESSAGE_SENT_LABEL[latest.template],
    sentAt: latest.sent_at,
    ...(sender ? { senderName: sender } : {}),
  }
}
