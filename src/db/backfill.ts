/* Repairs orders that predate order_units, which a migration strategy cannot do
   itself. The unit takes the order's id, so it reconciles with migration 0005. */
import type { AppDatabase } from './database'

export async function backfillOrderUnits(db: AppDatabase): Promise<number> {
  const orders = await db.orders.find().exec()
  let created = 0

  for (const order of orders) {
    try {
      // Storage instance, not a query: RxDB hides soft-deleted docs, so a unit
      // removed mid-archiveOrder would look like "never had one" and resurrect.
      const [existing] = await db.order_units.storageInstance.findDocumentsById([order.id], true)
      if (existing) continue

      await db.order_units.insert({
        id: order.id,
        order_id: order.id,
        position: 0,
        item_description: order.summary || 'Item',
        // price_total_minor is units + adjustment (invariant 1), so recovering
        // the lone unit subtracts it back out. Clamped against a stale value.
        price_minor: Math.max(0, order.price_total_minor - order.price_adjustment_minor),
        measurements: {},
        fabric_source: 'shop',
        done: false,
        created_at: order.created_at,
        updated_at: order.updated_at,
      })
      created++
    } catch (error) {
      // One unrepairable order must not stop the rest of the shop's orders
      // from being fixed; a later app start retries this same order.
      console.error(`[db] backfill failed for order ${order.id}:`, error)
    }
  }

  return created
}
