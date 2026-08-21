/* Repairs orders that predate order_units. The unit takes the order's id, so a
   second run cannot fabricate a duplicate for the same order. */
import type { PolysterDatabase } from './dexie/database'
import { insertRow, listAll } from './repo'

export async function backfillOrderUnits(db: PolysterDatabase): Promise<number> {
  const orders = await listAll(db.orders)
  if (orders.length === 0) return 0

  // Every unit, deleted ones included: a removed unit must not be recreated.
  const seen = new Set((await db.order_units.toArray()).map((unit) => unit.order_id))

  let created = 0
  for (const order of orders) {
    if (seen.has(order.id)) continue
    try {
      await insertRow(
        db.order_units,
        {
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
        },
        order.shop_id,
      )
      created++
    } catch (error) {
      console.error(`[db] backfill failed for order ${order.id}:`, error)
    }
  }

  return created
}
