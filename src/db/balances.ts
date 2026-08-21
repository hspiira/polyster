/* Order balances, derived from the payments on the device. The live versions
   are in db/repo/balances.ts; everything here is pure. */
import { OPEN_STAGES, type OrderDoc, type PaymentDoc } from './schema'

export interface OrderBalance {
  order_id: string
  price_total_minor: number
  amount_paid_minor: number
  balance_minor: number
  fully_paid: boolean
}

/* A payment's contribution to money-in, signed by kind. Exported because
   Reports aggregates "collected" too, and three copies would drift. */
export function signedAmountMinor(payment: Pick<PaymentDoc, 'amount_minor' | 'kind'>): number {
  return payment.kind === 'refund' ? -payment.amount_minor : payment.amount_minor
}

/** Pure calculation. Given an order and its payments, what is owed. */
export function calculateBalance(
  order: Pick<OrderDoc, 'id' | 'price_total_minor'>,
  payments: readonly Pick<PaymentDoc, 'amount_minor' | 'kind'>[],
): OrderBalance {
  const paidMinor = payments.reduce((sum, p) => sum + signedAmountMinor(p), 0)

  return {
    order_id: order.id,
    price_total_minor: order.price_total_minor,
    amount_paid_minor: paidMinor,
    balance_minor: order.price_total_minor - paidMinor,
    fully_paid: paidMinor >= order.price_total_minor,
  }
}

export interface ClientTotals {
  openOrders: number
  owedMinor: number
  totalOrders: number
}

const NO_TOTALS: ClientTotals = { openOrders: 0, owedMinor: 0, totalOrders: 0 }

type CountableOrder = Pick<OrderDoc, 'id' | 'stage'>

/* Cancelled orders keep a balance in the data but are never chased. */
export function clientTotals(
  orders: readonly CountableOrder[],
  balances: ReadonlyMap<string, OrderBalance>,
): ClientTotals {
  let openOrders = 0
  let owedMinor = 0

  for (const order of orders) {
    if (OPEN_STAGES.includes(order.stage)) openOrders += 1
    if (order.stage === 'cancelled') continue
    const balance = balances.get(order.id)?.balance_minor ?? 0
    if (balance > 0) owedMinor += balance
  }

  return { openOrders, owedMinor, totalOrders: orders.length }
}

export function clientTotalsById(
  orders: readonly (CountableOrder & Pick<OrderDoc, 'client_id'>)[],
  balances: ReadonlyMap<string, OrderBalance>,
): Map<string, ClientTotals> {
  const byClient = new Map<string, CountableOrder[]>()
  for (const order of orders) {
    const bucket = byClient.get(order.client_id)
    if (bucket) bucket.push(order)
    else byClient.set(order.client_id, [order])
  }

  const totals = new Map<string, ClientTotals>()
  for (const [clientId, theirs] of byClient) totals.set(clientId, clientTotals(theirs, balances))
  return totals
}

export function noClientTotals(): ClientTotals {
  return NO_TOTALS
}
