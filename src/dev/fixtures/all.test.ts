import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type AppDatabase } from '../../db/database'
import { REPLICATED_TABLES } from '../../db/replication'
import { seedAll } from './all'

/* supabaseClient reads import.meta.env once at module load, so the real guard is
   armed by whether the machine has a .env -- green here, red in CI. Mocked. */
const { isSupabaseConfigured } = vi.hoisted(() => ({ isSupabaseConfigured: vi.fn() }))
vi.mock('../../lib/supabaseClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/supabaseClient')>()),
  isSupabaseConfigured,
}))

beforeEach(() => {
  isSupabaseConfigured.mockReturnValue(false)
})

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
    isSupabaseConfigured.mockReturnValue(true)
    const db = await freshDatabase()
    await expect(seedAll(db)).rejects.toThrow(/replication would push/)

    const shops = await db.shops.find().exec()
    expect(shops).toHaveLength(0)
  }, 120000)

  // The other half of the guard, which no test could reach while the answer
  // came from the machine's own .env.
  it('seeds without force when there is no Supabase to push to', async () => {
    const db = await freshDatabase()
    await expect(seedAll(db)).resolves.toBeDefined()
    expect(await db.shops.count().exec()).toBe(3)
  }, 120000)

  it('seeds enough of everything to exercise lists, filters and reports', async () => {
    const db = await freshDatabase()
    await seedAll(db, { force: true })

    const counts = {
      clients: (await db.clients.find().exec()).length,
      orders: (await db.orders.find().exec()).length,
      payments: (await db.payments.find().exec()).length,
      sales: (await db.sales.find().exec()).length,
      expenses: (await db.expenses.find().exec()).length,
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
    const db = await freshDatabase()
    await seedAll(db, { force: true })

    const soldDays = new Set(
      (await db.sales.find().exec()).map((sale) => sale.sold_at.slice(0, 10)),
    )
    const dueDays = new Set(
      (await db.orders.find().exec()).map((order) => order.pickup_due_date),
    )

    expect(soldDays.size).toBeGreaterThanOrEqual(10)
    expect(dueDays.size).toBeGreaterThanOrEqual(15)
  }, 180000)

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
