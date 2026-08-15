/* Repairs orders that predate order_units, which a migration strategy cannot do
   itself. The unit takes the order's id, so it reconciles with migration 0005. */
import type { AppDatabase } from './database'

export async function backfillOrderUnits(db: AppDatabase): Promise<number> {
  const orders = await db.orders.find().exec()
  if (orders.length === 0) return 0

  const existingUnits = await db.order_units.find().exec()
  const ordersWithUnits = new Set(existingUnits.map((unit) => unit.order_id))

  let created = 0

  for (const order of orders) {
    try {
      if (ordersWithUnits.has(order.id)) continue

      const [tombstone] = await db.order_units.storageInstance.findDocumentsById([order.id], true)
      if (tombstone) continue

      await db.order_units.insert({
        id: order.id,
        order_id: order.id,
        position: 0,
        item_description: order.summary || 'Item',
        price_minor: Math.max(0, order.price_total_minor - order.price_adjustment_minor),
        measurements: {},
        fabric_source: 'shop',
        done: false,
        created_at: order.created_at,
        updated_at: order.updated_at,
      })
      created++
    } catch (error) {
      console.error(`[db] backfill failed for order ${order.id}:`, error)
    }
  }

  return created
}
