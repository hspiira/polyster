import type { AppDatabase } from '../database'
import {
  type PaymentDoc,
  type PaymentKind,
  type PaymentMethod,
} from '../schema'
import { paymentDateError, paymentError, toPaymentTimestamp } from '../../lib/payments'
import { calculateBalance } from '../balances'
import { newId, now, loadOrThrow } from './shared'

// --------------------------------------------------------------- payments

/* A refund is a positive row with kind 'refund', never a negative payment. The
   amount is capped against the order; the forms check too, this cannot be skipped. */
export async function recordPayment(
  db: AppDatabase,
  orderId: string,
  input: {
    amount_minor: number
    method: PaymentMethod
    notes?: string
    kind?: PaymentKind
    /** `YYYY-MM-DD`. Defaults to today; the past is allowed, the future is not. */
    payment_date?: string
  },
  staffId?: string,
): Promise<PaymentDoc> {
  const order = await loadOrThrow(db, 'orders', orderId, 'order')

  const existing = await db.payments.find({ selector: { order_id: orderId } }).exec()
  const balance = calculateBalance(order, existing.map((p) => p.toJSON()))
  const kind = input.kind ?? 'payment'

  const rejection =
    paymentError({
      priceTotalMinor: balance.price_total_minor,
      amountPaidMinor: balance.amount_paid_minor,
      amountMinor: input.amount_minor,
      kind,
      currency: order.currency,
    }) ?? (input.payment_date ? paymentDateError(input.payment_date) : null)
  if (rejection) throw new Error(rejection)

  const timestamp = now()
  const doc: PaymentDoc = {
    id: newId(),
    order_id: orderId,
    amount_minor: input.amount_minor,
    kind,
    payment_date: toPaymentTimestamp(input.payment_date, timestamp),
    created_at: timestamp,
    method: input.method,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(staffId ? { recorded_by: staffId } : {}),
  }
  await db.payments.insert(doc)
  return doc
}

/* A soft delete, forced by the `amount_minor > 0` constraint: retracted, never
   cancelled with a negative row. Trail patched first -- a removed doc cannot be. */
export async function voidPayment(
  db: AppDatabase,
  paymentId: string,
  reason?: string,
  staffId?: string,
): Promise<void> {
  const doc = await db.payments.findOne(paymentId).exec()
  if (!doc) return

  // patch() returns the updated revision -- remove() must be called on that,
  // not the stale `doc`, or RxDB rejects it as a revision conflict.
  const patched = await doc.patch({
    voided_at: now(),
    ...(staffId ? { voided_by: staffId } : {}),
    ...(reason?.trim() ? { void_reason: reason.trim() } : {}),
  })
  await patched.remove()
}
