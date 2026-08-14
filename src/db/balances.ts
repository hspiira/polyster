/* Order balances, derived locally from replicated payments. The `order_balances`
   view stays server-side only; its rules are mirrored here and tested. */
import { combineLatest, map, type Observable } from 'rxjs'
import type { AppDatabase } from './database'
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

/* Live balance for one order. Re-emits when the price or any payment changes,
   locally or via replication. */
export function observeBalance(db: AppDatabase, orderId: string): Observable<OrderBalance | null> {
  return combineLatest([
    db.orders.findOne(orderId).$,
    db.payments.find({ selector: { order_id: orderId } }).$,
  ]).pipe(
    map(([order, payments]) =>
      order ? calculateBalance(order, payments.map((p) => p.toJSON())) : null,
    ),
  )
}

/* Live balances for every order in a shop, keyed by order id. Drives the
   dashboard's outstanding-balance figures. */
export function observeShopBalances(
  db: AppDatabase,
  shopId: string,
): Observable<Map<string, OrderBalance>> {
  return combineLatest([
    db.orders.find({ selector: { shop_id: shopId } }).$,
    db.payments.find().$,
  ]).pipe(
    map(([orders, payments]) => {
      // One pass to bucket payments by order, rather than filtering the whole
      // payments list once per order.
      const byOrder = new Map<string, PaymentDoc[]>()
      for (const payment of payments) {
        const bucket = byOrder.get(payment.order_id)
        if (bucket) {
          bucket.push(payment.toJSON())
        } else {
          byOrder.set(payment.order_id, [payment.toJSON()])
        }
      }

      const balances = new Map<string, OrderBalance>()
      for (const order of orders) {
        balances.set(order.id, calculateBalance(order, byOrder.get(order.id) ?? []))
      }
      return balances
    }),
  )
}
