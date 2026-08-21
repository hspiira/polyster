import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type PolysterDatabase } from '../../db/dexie/database'
import { listAll } from '../../db/repo'
import { seedAll } from './all'

const opened: PolysterDatabase[] = []
let counter = 0

function freshDatabase(): PolysterDatabase {
  const db = createDatabase(`all_${++counter}`)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
})

describe('seedAll', () => {
  it('runs every fixture end to end', async () => {
    const db = freshDatabase()
    const tenants = await seedAll(db)

    expect(tenants.northFound.name).toBe('NORTH//FOUND')
    expect(new Set(Object.values(tenants).map((shop) => shop.id)).size).toBe(3)
  }, 120000)

  it('leaves no core collection empty', async () => {
    // The bug this guards: a fixture that silently stops covering a store, so a
    // screen reads from a table nothing ever writes to.
    const db = freshDatabase()
    await seedAll(db)

    const empty: string[] = []
    for (const store of [
      'shops', 'staff', 'clients', 'measurement_fields', 'measurement_profiles',
      'orders', 'payments', 'order_stage_history', 'order_units', 'sales',
      'expenses', 'message_log', 'tenant_features', 'events',
    ] as const) {
      if ((await db.table(store).toArray()).length === 0) empty.push(store)
    }

    expect(empty).toEqual([])
  }, 120000)

  it('seeds enough of everything to exercise lists, filters and reports', async () => {
    const db = freshDatabase()
    await seedAll(db)

    const counts = {
      clients: (await listAll(db.clients)).length,
      orders: (await listAll(db.orders)).length,
      payments: (await listAll(db.payments)).length,
      sales: (await listAll(db.sales)).length,
      expenses: (await listAll(db.expenses)).length,
    }

    expect(counts).toMatchObject({
      clients: expect.any(Number),
      orders: expect.any(Number),
    })
    expect(counts.clients).toBeGreaterThanOrEqual(35)
    expect(counts.orders).toBeGreaterThanOrEqual(50)
    expect(counts.payments).toBeGreaterThanOrEqual(50)
    expect(counts.sales).toBeGreaterThanOrEqual(40)
    expect(counts.expenses).toBeGreaterThanOrEqual(30)
  }, 180000)

  it('spreads sales and orders across dates rather than stacking them on today', async () => {
    const db = freshDatabase()
    await seedAll(db)

    const soldDays = new Set(
      (await listAll(db.sales)).map((sale) => sale.sold_at.slice(0, 10)),
    )
    const dueDays = new Set(
      (await listAll(db.orders)).map((order) => order.pickup_due_date),
    )

    expect(soldDays.size).toBeGreaterThanOrEqual(10)
    expect(dueDays.size).toBeGreaterThanOrEqual(15)
  }, 180000)

  it('covers every order type the schema allows', async () => {
    const db = freshDatabase()
    await seedAll(db)

    const orders = await listAll(db.orders)
    const types = new Set(orders.map((order) => order.order_type))

    expect(types).toEqual(
      new Set(['tailor_made', 'rental', 'purchase', 'pre_order', 'repair']),
    )
  }, 120000)
})
