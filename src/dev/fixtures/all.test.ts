import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type AppDatabase } from '../../db/database'
import { REPLICATED_TABLES } from '../../db/replication'
import { seedAll } from './all'

const created: AppDatabase[] = []

async function freshDatabase(): Promise<AppDatabase> {
  const db = await createDatabase({
    name: `all_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    devMode: true,
  })
  created.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((db) => db.remove()))
})

describe('seedAll', () => {
  it('runs every fixture end to end', async () => {
    const db = await freshDatabase()
    const tenants = await seedAll(db, { force: true })

    expect(tenants.northFound.name).toBe('NORTH//FOUND')
    expect(new Set(Object.values(tenants).map((shop) => shop.id)).size).toBe(3)
  }, 120000)

  it('leaves no replicated collection empty', async () => {
    // The bug this guards: a fixture that silently stops covering a collection,
    // so a screen reads from a table nothing ever writes to.
    const db = await freshDatabase()
    await seedAll(db, { force: true })

    const empty: string[] = []
    for (const table of REPLICATED_TABLES) {
      const docs = await db.collections[table].find().exec()
      if (docs.length === 0) empty.push(table)
    }

    expect(empty).toEqual([])
  }, 120000)

  it('refuses to seed over a configured Supabase unless forced', async () => {
    // Replication pushes as well as pulls, so an unguarded seed here would
    // copy three fixture tenants into the remote database.
    const db = await freshDatabase()
    await expect(seedAll(db)).rejects.toThrow(/replication would push/)

    const shops = await db.shops.find().exec()
    expect(shops).toHaveLength(0)
  }, 120000)

  it('covers every order type the schema allows', async () => {
    const db = await freshDatabase()
    await seedAll(db, { force: true })

    const orders = await db.orders.find().exec()
    const types = new Set(orders.map((order) => order.order_type))

    expect(types).toEqual(
      new Set(['tailor_made', 'rental', 'purchase', 'pre_order', 'repair']),
    )
  }, 120000)
})
