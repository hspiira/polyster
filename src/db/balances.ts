/**
 * Order balances, computed locally.
 *
 * There is an `order_balances` view in Postgres (see 0001_init.sql) and the UI
 * deliberately does not read it. RxDB replicates tables, not views, so a
 * balance fetched from the view is a live network call -- on the order detail
 * screen, which is exactly the screen most likely to be open with no
 * connectivity. The view stays for server-side reporting; the app derives the
 * same figure from the already-replicated `payments` collection.
 *
 * Keeping both means keeping them in agreement. The two rules the view applies
 * are mirrored here and tested in balances.test.ts:
 *   - soft-deleted payments do not count (RxDB excludes `_deleted` documents
 *     from query results by default, so this comes for free)
 *   - an order with no payments has amount_paid 0, not null
 */
import { combineLatest, map, type Observable } from 'rxjs'
import type { AppDatabase } from './database'
import type { OrderDoc, PaymentDoc } from './schema'

export interface OrderBalance {
  order_id: string
  price_total_minor: number
  amount_paid_minor: number
  /** price_total_minor - amount_paid_minor. Negative means the client overpaid. */
  balance_minor: number
  fully_paid: boolean
}

/** Pure calculation. Given an order and its payments, what is owed. */
export function calculateBalance(
  order: Pick<OrderDoc, 'id' | 'price_total_minor'>,
  payments: readonly Pick<PaymentDoc, 'amount_minor' | 'kind'>[],
): OrderBalance {
  // A refund gives money back, so it subtracts from what the client has paid.
  const paidMinor = payments.reduce(
    (sum, p) => sum + (p.kind === 'refund' ? -p.amount_minor : p.amount_minor),
    0,
  )

  return {
    order_id: order.id,
    price_total_minor: order.price_total_minor,
    amount_paid_minor: paidMinor,
    balance_minor: order.price_total_minor - paidMinor,
    fully_paid: paidMinor >= order.price_total_minor,
  }
}

/**
 * Live balance for one order. Re-emits whenever the order's price or any of
 * its payments change, locally or via replication.
 */
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

/**
 * Live balances for every order in a shop, keyed by order id. Used by the
 * dashboard's outstanding-balance figures (IMPLEMENTATION_PLAN.md Phase 1
 * step 7).
 */
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
