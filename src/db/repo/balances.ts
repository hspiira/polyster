import type { PolysterDatabase } from '../dexie/database'
import type { OrderBalance } from '../balances'
import { calculateBalance } from '../balances'
import { alive, liveQuery, listAll, listBy, type Observable } from './base'

/** Live balance for one order. Re-emits when the price or any payment changes. */
export function observeBalance(
  db: PolysterDatabase,
  orderId: string,
): Observable<OrderBalance | null> {
  return liveQuery(async () => {
    const order = await db.orders.get(orderId)
    if (!order || order.deleted_at) return null
    return calculateBalance(order, await listBy(db.payments, 'order_id', orderId))
  })
}

/* Live balances for every order in a shop, keyed by order id. Drives the
   dashboard's outstanding-balance figures. */
export function observeShopBalances(
  db: PolysterDatabase,
  shopId: string,
): Observable<Map<string, OrderBalance>> {
  return liveQuery(async () => {
    const orders = alive(await db.orders.where('shop_id').equals(shopId).toArray())
    const payments = await listAll(db.payments)

    // One pass to bucket payments by order, rather than filtering the whole
    // payments list once per order.
    const byOrder = new Map<string, typeof payments>()
    for (const payment of payments) {
      const bucket = byOrder.get(payment.order_id)
      if (bucket) bucket.push(payment)
      else byOrder.set(payment.order_id, [payment])
    }

    const balances = new Map<string, OrderBalance>()
    for (const order of orders) {
      balances.set(order.id, calculateBalance(order, byOrder.get(order.id) ?? []))
    }
    return balances
  })
}
