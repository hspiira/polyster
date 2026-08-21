import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type PolysterDatabase } from './dexie/database'
import { backfillOrderUnits } from './backfill'
import { newId } from '../lib/ids'
import {
  addOrderUnit,
  createClient,
  createOrder,
  createShop,
  getRow,
  listBy,
  setOrderAdjustment,
  softDeleteRow,
} from './repo'

const opened: PolysterDatabase[] = []
let counter = 0

function freshDatabase(): PolysterDatabase {
  const db = createDatabase(`backfill_${++counter}`)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
})

/** An order with no unit behind it, the exact shape a v0->v1 migration leaves. */
async function insertOrderWithoutUnits(
  db: PolysterDatabase,
  input: { summary: string; price_total_minor: number; price_adjustment_minor?: number },
): Promise<string> {
  const orderId = newId()
  const timestamp = new Date().toISOString()

  await db.orders.add({
    id: orderId,
    shop_id: newId(),
    client_id: newId(),
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
  it('creates one unit per order, using the order id as the unit id', async () => {
    const db = freshDatabase()
    const orderId = await insertOrderWithoutUnits(db, { summary: 'Kanzu', price_total_minor: 45000 })

    expect(await backfillOrderUnits(db)).toBe(1)

    const unit = await getRow(db.order_units, orderId)
    expect(unit?.order_id).toBe(orderId)
    expect(unit?.id).toBe(orderId)
    expect(unit?.price_minor).toBe(45000)
  })

  it('is idempotent: a second run creates nothing, and one unit exists in total', async () => {
    const db = freshDatabase()
    await insertOrderWithoutUnits(db, { summary: 'Kanzu', price_total_minor: 45000 })

    await backfillOrderUnits(db)
    expect(await backfillOrderUnits(db)).toBe(0)
    expect((await db.order_units.toArray()).filter((row) => !row.deleted_at).length).toBe(1)
  })

  it('does not duplicate a unit that already arrived by replication', async () => {
    const db = freshDatabase()
    const orderId = await insertOrderWithoutUnits(db, { summary: 'Kanzu', price_total_minor: 45000 })
    const timestamp = new Date().toISOString()

    // Same primary key the server backfill would have used -- this is what
    // makes the two repairs reconcile instead of duplicating.
    await db.order_units.add({
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
    expect((await db.order_units.toArray()).filter((row) => !row.deleted_at).length).toBe(1)
  })

  // Regression guard: a unit soft-deleted mid-archiveOrder must read as
  // "already had one", not "predates order units". Queries hide soft deletes.
  it('does not resurrect a unit that was soft-deleted, rather than never created', async () => {
    const db = freshDatabase()
    const orderId = await insertOrderWithoutUnits(db, { summary: 'Kanzu', price_total_minor: 45000 })
    const timestamp = new Date().toISOString()

    await db.order_units.add({
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
    await softDeleteRow(db.order_units, orderId)

    expect(await backfillOrderUnits(db)).toBe(0)
    expect((await db.order_units.toArray()).filter((row) => !row.deleted_at).length).toBe(0)

    expect((await db.order_units.get(orderId))?.deleted_at).toBeTypeOf('string')
  })

  it('clamps a stale adjustment that would drive the recovered price negative', async () => {
    const db = freshDatabase()
    const orderId = await insertOrderWithoutUnits(db, {
      summary: 'Refund test',
      price_total_minor: 1000,
      price_adjustment_minor: 5000,
    })

    expect(await backfillOrderUnits(db)).toBe(1)

    const unit = await getRow(db.order_units, orderId)
    expect(unit?.price_minor).toBe(0)
  })

  it('does not let one order that fails to insert stop the rest from being repaired', async () => {
    const db = freshDatabase()
    const orderA = await insertOrderWithoutUnits(db, { summary: 'Kanzu', price_total_minor: 45000 })
    const orderB = await insertOrderWithoutUnits(db, { summary: 'Gomesi', price_total_minor: 80000 })

    // Fails only orderA's insert, regardless of query iteration order, so the
    // assertion below holds no matter which order the storage returns first.
    const originalAdd = db.order_units.add.bind(db.order_units)
    const insertSpy = vi.spyOn(db.order_units, 'add').mockImplementation((row) => {
      if (row.id === orderA) throw new Error('simulated storage failure')
      return originalAdd(row)
    })

    // The log is the only trace an operator gets that an order was skipped, so
    // assert it rather than let it leak into the run's stderr.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await backfillOrderUnits(db)).toBe(1)

    expect(await getRow(db.order_units, orderA)).toBeNull()
    expect(await getRow(db.order_units, orderB)).not.toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(orderA), expect.any(Error))

    errorSpy.mockRestore()
    insertSpy.mockRestore()
  })

  describe('against an order the app itself created', () => {
    async function realOrder(db: PolysterDatabase) {
      const shop = await createShop(db, { name: 'Northfound', whatsapp_number: '+256772123456' })
      const client = await createClient(db, shop.id, { name: 'Grace' })
      const order = await createOrder(db, shop.id, {
        client_id: client.id,
        order_type: 'tailor_made',
        pickup_due_date: '2026-09-01',
        item_description: 'Navy three-piece suit',
        price_total_minor: 450000,
      })
      return order
    }

    it('fabricates nothing for a single-item order', async () => {
      const db = freshDatabase()
      const order = await realOrder(db)

      expect(await backfillOrderUnits(db)).toBe(0)
      expect((await listBy(db.order_units, 'order_id', order.id)).length).toBe(1)
    })

    it('fabricates nothing for a multi-item order', async () => {
      const db = freshDatabase()
      const order = await realOrder(db)
      await addOrderUnit(db, order.id, { item_description: 'Waistcoat', price_minor: 120000 })

      expect(await backfillOrderUnits(db)).toBe(0)
      expect((await listBy(db.order_units, 'order_id', order.id)).length).toBe(2)
    })

    it('leaves the order total alone across a recalculate', async () => {
      const db = freshDatabase()
      const order = await realOrder(db)

      await backfillOrderUnits(db)
      await setOrderAdjustment(db, order.id, 0)

      expect((await getRow(db.orders, order.id))?.price_total_minor).toBe(450000)
    })

    it('still skips an order whose only unit is keyed on the order id', async () => {
      const db = freshDatabase()
      const orderId = await insertOrderWithoutUnits(db, {
        summary: 'Kanzu',
        price_total_minor: 45000,
      })
      const timestamp = new Date().toISOString()
      await db.order_units.add({
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
      expect((await db.order_units.toArray()).filter((row) => !row.deleted_at).length).toBe(1)
    })
  })
})
