import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type AppDatabase } from './database'
import {
  addOrderUnit,
  buildSummary,
  removeOrderUnit,
  reorderOrderUnits,
  setOrderAdjustment,
  setUnitDone,
  updateOrderUnit,
} from './writes'

describe('buildSummary', () => {
  // Invariant 3. Pinned exactly, because two call sites computing a cache
  // differently is the failure a cache invites.
  it('takes the first description up to its comma, plus a count', () => {
    expect(buildSummary(['Kanzu, navy', 'Gomesi, gold trim', 'Shirt, white'])).toBe('Kanzu +2')
    expect(buildSummary(['Kanzu, navy'])).toBe('Kanzu')
    expect(buildSummary(['Kanzu'])).toBe('Kanzu')
    expect(buildSummary([])).toBe('')
  })
})

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

// Matches the fixtures buildSummary's own tests are pinned against.
const DESCRIPTIONS = ['Kanzu, navy', 'Gomesi, gold trim', 'Shirt, white']

/** A fresh order with one unit per price, added via addOrderUnit in order. */
async function orderWithUnits(
  prices: number[],
): Promise<{ db: AppDatabase; orderId: string; unitIds: string[] }> {
  const db = await freshDatabase()
  const orderId = crypto.randomUUID()
  const timestamp = new Date().toISOString()

  await db.orders.insert({
    id: orderId,
    shop_id: crypto.randomUUID(),
    client_id: crypto.randomUUID(),
    order_type: 'tailor_made',
    reference: '1234-ABCDE',
    currency: 'UGX',
    summary: '',
    stage: 'measured',
    price_total_minor: 0,
    price_adjustment_minor: 0,
    rental_deposit_minor: 0,
    pickup_due_date: '2026-08-12',
    created_at: timestamp,
    updated_at: timestamp,
  })

  const unitIds: string[] = []
  for (const [index, price] of prices.entries()) {
    const unit = await addOrderUnit(db, orderId, {
      item_description: DESCRIPTIONS[index] ?? `Item ${index}`,
      price_minor: price,
    })
    unitIds.push(unit.id)
  }

  return { db, orderId, unitIds }
}

describe('recalculateOrder', () => {
  it('keeps price_total_minor equal to the units plus the adjustment', async () => {
    const { db, orderId } = await orderWithUnits([45000, 80000, 30000])
    await setOrderAdjustment(db, orderId, -5000, 'regular customer')

    const order = await db.orders.findOne(orderId).exec()
    expect(order?.price_total_minor).toBe(150000)
    expect(order?.summary).toBe('Kanzu +2')
  })

  it('recalculates after every unit operation', async () => {
    const { db, orderId, unitIds } = await orderWithUnits([45000, 80000, 30000])

    await updateOrderUnit(db, unitIds[1]!, { item_description: 'Gomesi', price_minor: 90000 })
    expect((await db.orders.findOne(orderId).exec())?.price_total_minor).toBe(165000)

    await removeOrderUnit(db, unitIds[2]!)
    expect((await db.orders.findOne(orderId).exec())?.price_total_minor).toBe(135000)
  })

  it('refuses to remove the last unit', async () => {
    const { db, unitIds } = await orderWithUnits([45000])
    await expect(removeOrderUnit(db, unitIds[0]!)).rejects.toThrow()
  })

  it('refuses an adjustment that would drive the total negative', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    await expect(setOrderAdjustment(db, orderId, -50000, 'too much')).rejects.toThrow()
  })

  it('recalculates summary after a reorder changes the leading unit', async () => {
    const { db, orderId, unitIds } = await orderWithUnits([45000, 80000, 30000])

    await reorderOrderUnits(db, orderId, [unitIds[1]!, unitIds[0]!, unitIds[2]!])

    expect((await db.orders.findOne(orderId).exec())?.summary).toBe('Gomesi +2')
  })

  it('lets setUnitDone toggle done without changing price_total_minor', async () => {
    const { db, orderId, unitIds } = await orderWithUnits([45000, 80000])
    const before = (await db.orders.findOne(orderId).exec())?.price_total_minor

    await setUnitDone(db, unitIds[0]!, true)

    expect((await db.order_units.findOne(unitIds[0]!).exec())?.done).toBe(true)
    expect((await db.orders.findOne(orderId).exec())?.price_total_minor).toBe(before)
  })
})
