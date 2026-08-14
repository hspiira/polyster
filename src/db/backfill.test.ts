import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type AppDatabase } from './database'
import { backfillOrderUnits } from './backfill'
import type { OrderUnitDoc } from './schema'

const created: AppDatabase[] = []

async function freshDatabase(): Promise<AppDatabase> {
  const db = await createDatabase({
    name: `test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    devMode: true,
  })
  created.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((db) => db.remove()))
})

/** An order with no unit behind it, the exact shape a v0->v1 migration leaves. */
async function insertOrderWithoutUnits(
  db: AppDatabase,
  input: { summary: string; price_total_minor: number; price_adjustment_minor?: number },
): Promise<string> {
  const orderId = crypto.randomUUID()
  const timestamp = new Date().toISOString()

  await db.orders.insert({
    id: orderId,
    shop_id: crypto.randomUUID(),
    client_id: crypto.randomUUID(),
    order_type: 'tailor_made',
    reference: '1234-ABCDE',
    currency: 'UGX',
    summary: input.summary,
    stage: 'measured',
    price_total_minor: input.price_total_minor,
    price_adjustment_minor: input.price_adjustment_minor ?? 0,
    rental_deposit_minor: 0,
    pickup_due_date: '2026-08-12',
    created_at: timestamp,
    updated_at: timestamp,
  })

  return orderId
}

describe('backfillOrderUnits', () => {
  // createDatabase already runs the backfill once on creation (idempotently,
  // against zero orders), so these assert on the delta each call itself makes.
  it('creates one unit per order, using the order id as the unit id', async () => {
    const db = await freshDatabase()
    const orderId = await insertOrderWithoutUnits(db, { summary: 'Kanzu', price_total_minor: 45000 })

    expect(await backfillOrderUnits(db)).toBe(1)

    const unit = await db.order_units.findOne(orderId).exec()
    expect(unit?.order_id).toBe(orderId)
    expect(unit?.id).toBe(orderId)
    expect(unit?.price_minor).toBe(45000)
  })

  it('is idempotent: a second run creates nothing, and one unit exists in total', async () => {
    const db = await freshDatabase()
    await insertOrderWithoutUnits(db, { summary: 'Kanzu', price_total_minor: 45000 })

    await backfillOrderUnits(db)
    expect(await backfillOrderUnits(db)).toBe(0)
    expect(await db.order_units.count().exec()).toBe(1)
  })

  it('does not duplicate a unit that already arrived by replication', async () => {
    const db = await freshDatabase()
    const orderId = await insertOrderWithoutUnits(db, { summary: 'Kanzu', price_total_minor: 45000 })
    const timestamp = new Date().toISOString()

    // Same primary key the server backfill would have used -- this is what
    // makes the two repairs reconcile instead of duplicating.
    await db.order_units.insert({
      id: orderId,
      order_id: orderId,
      position: 0,
      item_description: 'Kanzu, navy',
      price_minor: 45000,
      measurements: {},
      fabric_source: 'shop',
      done: false,
      created_at: timestamp,
      updated_at: timestamp,
    })

    expect(await backfillOrderUnits(db)).toBe(0)
    expect(await db.order_units.count().exec()).toBe(1)
  })

  // Regression guard: a unit soft-deleted mid-archiveOrder must read as
  // "already had one", not "predates order units". Queries hide soft deletes.
  it('does not resurrect a unit that was soft-deleted, rather than never created', async () => {
    const db = await freshDatabase()
    const orderId = await insertOrderWithoutUnits(db, { summary: 'Kanzu', price_total_minor: 45000 })
    const timestamp = new Date().toISOString()

    const unit = await db.order_units.insert({
      id: orderId,
      order_id: orderId,
      position: 0,
      item_description: 'Kanzu, navy',
      price_minor: 45000,
      measurements: {},
      fabric_source: 'shop',
      done: false,
      created_at: timestamp,
      updated_at: timestamp,
    })
    await unit.remove()

    expect(await backfillOrderUnits(db)).toBe(0)
    expect(await db.order_units.count().exec()).toBe(0)

    const [raw] = await db.order_units.storageInstance.findDocumentsById([orderId], true)
    expect(raw?._deleted).toBe(true)
  })

  it('clamps a stale adjustment that would drive the recovered price negative', async () => {
    const db = await freshDatabase()
    const orderId = await insertOrderWithoutUnits(db, {
      summary: 'Refund test',
      price_total_minor: 1000,
      price_adjustment_minor: 5000,
    })

    expect(await backfillOrderUnits(db)).toBe(1)

    const unit = await db.order_units.findOne(orderId).exec()
    expect(unit?.price_minor).toBe(0)
  })

  it('does not let one order that fails to insert stop the rest from being repaired', async () => {
    const db = await freshDatabase()
    const orderA = await insertOrderWithoutUnits(db, { summary: 'Kanzu', price_total_minor: 45000 })
    const orderB = await insertOrderWithoutUnits(db, { summary: 'Gomesi', price_total_minor: 80000 })

    // Fails only orderA's insert, regardless of query iteration order, so the
    // assertion below holds no matter which order the storage returns first.
    const originalInsert = db.order_units.insert.bind(db.order_units)
    const insertSpy = vi.spyOn(db.order_units, 'insert').mockImplementation((doc) => {
      if ((doc as OrderUnitDoc).id === orderA) throw new Error('simulated storage failure')
      return originalInsert(doc)
    })

    // The log is the only trace an operator gets that an order was skipped, so
    // assert it rather than let it leak into the run's stderr.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await backfillOrderUnits(db)).toBe(1)

    expect(await db.order_units.findOne(orderA).exec()).toBeNull()
    expect(await db.order_units.findOne(orderB).exec()).not.toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(orderA), expect.any(Error))

    errorSpy.mockRestore()
    insertSpy.mockRestore()
  })
})
