/**
 * What a payment is allowed to be, given what the order already has on it.
 *
 * Pure and shared, so the write layer and both payment forms give the same
 * answer. A form that accepts an amount the write will reject is a wasted tap,
 * and a write with no check is how an order ends up paid twice over.
 */
import { formatMinor } from './money'
import { today } from './dates'

export interface PaymentCheck {
  /** What the order costs. */
  priceTotalMinor: number
  /** Payments minus refunds so far. */
  amountPaidMinor: number
  /** The amount being recorded now. Always positive, for both kinds. */
  amountMinor: number
  kind: 'payment' | 'refund'
  currency: string
}

/** What is still owed. Never negative: an overpaid order owes nothing. */
export function outstandingMinor(priceTotalMinor: number, amountPaidMinor: number): number {
  return Math.max(0, priceTotalMinor - amountPaidMinor)
}

/**
 * Money taken yesterday and entered today is normal in a shop, so the date is
 * editable. The future is not: that is money nobody has handed over.
 */
export function paymentDateError(date: string, todayIso: string = today()): string | null {
  if (!date) return 'Choose the date this money was taken.'
  if (date > todayIso) return 'A payment cannot be dated in the future.'
  return null
}

/**
 * When to stamp `payment_date`. Today keeps the real time; a backdated entry
 * goes to noon so the date cannot slip either way across a timezone.
 * `created_at` still records when it was actually typed in.
 */
export function toPaymentTimestamp(
  date: string | undefined,
  nowIso: string,
  todayIso: string = today(),
): string {
  if (!date || date === todayIso) return nowIso
  return new Date(`${date}T12:00:00`).toISOString()
}

/** Why this payment cannot be recorded, or null when it can. */
export function paymentError({
  priceTotalMinor,
  amountPaidMinor,
  amountMinor,
  kind,
  currency,
}: PaymentCheck): string | null {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return 'Enter an amount greater than zero.'
  }

  if (kind === 'refund') {
    if (amountPaidMinor <= 0) return 'Nothing has been paid on this order yet.'
    if (amountMinor > amountPaidMinor) {
      return `You can only refund up to ${formatMinor(amountPaidMinor, currency)}.`
    }
    return null
  }

  if (priceTotalMinor <= 0) {
    return 'Add what this order is for before taking money against it.'
  }

  const outstanding = outstandingMinor(priceTotalMinor, amountPaidMinor)
  if (outstanding <= 0) {
    return 'This order is fully paid. Nothing more is owed on it.'
  }
  if (amountMinor > outstanding) {
    return `That is more than the ${formatMinor(outstanding, currency)} still owed.`
  }

  return null
}
