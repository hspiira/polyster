/**
 * Repairs orders that predate order_units: a migration strategy runs per
 * document within one collection and cannot create a document in another
 * (see the migrations note in database.ts), so a device that migrated
 * existing orders offline is left with orders that have none.
 *
 * The new unit takes the order's own id. The server-side backfill in
 * migration 0005 does the same, so if this device creates one and the
 * server's later arrives by replication, they reconcile as one document
 * instead of duplicating.
 */
import type { AppDatabase } from './database'

export async function backfillOrderUnits(db: AppDatabase): Promise<number> {
  const orders = await db.orders.find().exec()
  let created = 0

  for (const order of orders) {
    try {
      // Reads through the storage instance rather than a query: RxDB queries
      // hide soft-deleted docs, so a unit removed mid-archiveOrder would
      // otherwise look identical to "never had one" and get resurrected.
      const [existing] = await db.order_units.storageInstance.findDocumentsById([order.id], true)
      if (existing) continue

      await db.order_units.insert({
        id: order.id,
        order_id: order.id,
        position: 0,
        item_description: order.summary || 'Item',
        // price_total_minor is units + adjustment (invariant 1); recovering
        // the lone unit means subtracting the adjustment back out. Clamped:
        // a stale adjustment must never produce what the schema forbids.
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
