import type { PolysterDatabase, Stored } from '../dexie/database'
import type { PaymentDoc, PaymentKind, PaymentMethod } from '../schema'
import { paymentDateError, paymentError, toPaymentTimestamp } from '../../lib/payments'
import { calculateBalance } from '../balances'
import { newId } from '../../lib/ids'
import {
  insertRow,
  listBy,
  loadOrThrow,
  now,
  observeBy,
  voidRow,
  type Observable,
} from './base'

/** What has been paid on one order, most recent first. */
export function observeOrderPayments(
  db: PolysterDatabase,
  orderId: string,
): Observable<Stored<PaymentDoc>[]> {
  return observeBy(db.payments, 'order_id', orderId, { key: 'payment_date', dir: 'desc' })
}

/** Every payment in one shop, which is what the reports bucket by order. */
export function observePayments(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<PaymentDoc>[]> {
  return observeBy(db.payments, 'shop_id', shopId)
}

export function listPayments(
  db: PolysterDatabase,
  shopId: string,
): Promise<Stored<PaymentDoc>[]> {
  return listBy(db.payments, 'shop_id', shopId)
}

export interface NewPaymentInput {
  amount_minor: number
  method: PaymentMethod
  notes?: string
  kind?: PaymentKind
  /** `YYYY-MM-DD`. Defaults to today; the past is allowed, the future is not. */
  payment_date?: string
}

/* A refund is a positive row with kind 'refund', never a negative payment. The
   amount is capped against the order; the forms check too, this cannot be skipped. */
export async function recordPayment(
  db: PolysterDatabase,
  orderId: string,
  input: NewPaymentInput,
  staffId?: string,
): Promise<PaymentDoc> {
  const order = await loadOrThrow(db.orders, orderId, 'order')

  const existing = await listBy(db.payments, 'order_id', orderId)
  const balance = calculateBalance(order, existing)
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
    shop_id: order.shop_id,
    order_id: orderId,
    amount_minor: input.amount_minor,
    kind,
    payment_date: toPaymentTimestamp(input.payment_date, timestamp),
    created_at: timestamp,
    method: input.method,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(staffId ? { recorded_by: staffId } : {}),
  }

  return insertRow(db.payments, doc, order.shop_id, order.reference)
}

/* Retracted rather than cancelled with a negative row, which the amount
   constraint forbids. */
export async function voidPayment(
  db: PolysterDatabase,
  paymentId: string,
  reason?: string,
  staffId?: string,
): Promise<void> {
  await voidRow(db.payments, paymentId, { reason, staffId })
}
