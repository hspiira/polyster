import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type AppDatabase } from './database'
import {
  addOrderUnit,
  buildSummary,
  cancelOrder,
  changeOrderStage,
  copyMeasurementsFromClient,
  createClient,
  createMeasurementField,
  createOrder,
  reactivateMeasurementField,
  recordPayment,
  removeOrderUnit,
  reorderOrderUnits,
  retireMeasurementField,
  saveMeasurements,
  saveUnitMeasurementsToClient,
  setOrderAdjustment,
  setUnitDone,
  updateOrder,
  updateOrderUnit,
  voidPayment,
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

const shopId = crypto.randomUUID()

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

/** An order with one unit carrying a measurement snapshot, and its client. */
async function unitWithMeasurements(measurements: Record<string, string | number>) {
  const { db, orderId } = await orderWithUnits([45000])
  const client = await createClient(db, shopId, { name: 'Mrs. Okello' })

  const units = await db.order_units.find({ selector: { order_id: orderId } }).exec()
  const unitId = units[0]!.id
  await updateOrderUnit(db, unitId, { measurements })

  return { db, clientId: client.id, unitId }
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

describe('createOrder', () => {
  // The exact path the critical finding was about: a second writer of the
  // cache that stores the raw description instead of deriving it.
  it('derives summary from the unit rather than storing the raw description', async () => {
    const db = await freshDatabase()

    const order = await createOrder(db, crypto.randomUUID(), {
      client_id: crypto.randomUUID(),
      order_type: 'tailor_made',
      item_description: 'Kanzu, navy',
      price_total_minor: 45000,
      pickup_due_date: '2026-08-12',
    })

    expect(order.summary).toBe('Kanzu')
    expect(order.price_total_minor).toBe(45000)

    const units = await db.order_units.find({ selector: { order_id: order.id } }).exec()
    expect(units).toHaveLength(1)
    expect(units[0]?.item_description).toBe('Kanzu, navy')
    expect(units[0]?.price_minor).toBe(45000)
  })
})

describe('updateOrder', () => {
  it('lands no header changes when it rejects the multi-unit guard', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    await addOrderUnit(db, orderId, { item_description: 'Gomesi, gold trim', price_minor: 80000 })

    const before = await db.orders.findOne(orderId).exec()
    const originalClientId = before?.client_id
    const originalPickupDate = before?.pickup_due_date
    const originalNotes = before?.notes

    await expect(
      updateOrder(db, orderId, {
        client_id: crypto.randomUUID(),
        order_type: 'tailor_made',
        item_description: 'New description',
        price_total_minor: 999,
        pickup_due_date: '2030-01-01',
        notes: 'should not land',
      }),
    ).rejects.toThrow()

    const after = await db.orders.findOne(orderId).exec()
    expect(after?.client_id).toBe(originalClientId)
    expect(after?.pickup_due_date).toBe(originalPickupDate)
    expect(after?.notes).toBe(originalNotes)
  })

  it('refuses a multi-unit order and leaves its units untouched', async () => {
    const { db, orderId, unitIds } = await orderWithUnits([45000])
    const secondUnit = await addOrderUnit(db, orderId, {
      item_description: 'Gomesi, gold trim',
      price_minor: 80000,
    })

    await expect(
      updateOrder(db, orderId, {
        client_id: crypto.randomUUID(),
        order_type: 'tailor_made',
        item_description: 'New description',
        price_total_minor: 999,
        pickup_due_date: '2030-01-01',
      }),
    ).rejects.toThrow()

    const firstUnit = await db.order_units.findOne(unitIds[0]!).exec()
    const secondUnitAfter = await db.order_units.findOne(secondUnit.id).exec()
    expect(firstUnit?.item_description).toBe('Kanzu, navy')
    expect(firstUnit?.price_minor).toBe(45000)
    expect(secondUnitAfter?.item_description).toBe('Gomesi, gold trim')
    expect(secondUnitAfter?.price_minor).toBe(80000)
  })
})

describe('changeOrderStage', () => {
  it('stamps only the terminal timestamp matching the stage entered', async () => {
    const { db, orderId } = await orderWithUnits([45000])

    await changeOrderStage(db, orderId, 'ready')
    let order = await db.orders.findOne(orderId).exec()
    expect(order?.stage).toBe('ready')
    expect(order?.picked_up_at).toBeUndefined()

    await changeOrderStage(db, orderId, 'picked_up')
    order = await db.orders.findOne(orderId).exec()
    expect(order?.stage).toBe('picked_up')
    expect(order?.picked_up_at).toBeTruthy()
    expect(order?.returned_at).toBeUndefined()
  })

  it('never lets an extraPatch override the stage or its timestamp', async () => {
    const { db, orderId } = await orderWithUnits([45000])

    await changeOrderStage(db, orderId, 'cancelled', undefined, {
      // A malicious or careless caller trying to smuggle its own stage and
      // timestamp through -- this must lose to the function's own fields.
      stage: 'ready',
      cancelled_at: '2000-01-01T00:00:00.000Z',
    })

    const order = await db.orders.findOne(orderId).exec()
    expect(order?.stage).toBe('cancelled')
    expect(order?.cancelled_at).not.toBe('2000-01-01T00:00:00.000Z')
    expect(order?.cancelled_at).toBeTruthy()
  })
})

describe('cancelOrder', () => {
  it('moves the order to cancelled, stamps cancelled_at, and records the reason', async () => {
    const { db, orderId } = await orderWithUnits([45000])

    await cancelOrder(db, orderId, 'client changed their mind')

    const order = await db.orders.findOne(orderId).exec()
    expect(order?.stage).toBe('cancelled')
    expect(order?.cancelled_at).toBeTruthy()
    expect(order?.cancellation_reason).toBe('client changed their mind')

    const history = await db.order_stage_history.find({ selector: { order_id: orderId } }).exec()
    expect(history.some((entry) => entry.to_stage === 'cancelled')).toBe(true)
  })
})

describe('recordPayment', () => {
  it('defaults to kind payment, and accepts an explicit refund', async () => {
    const { db, orderId } = await orderWithUnits([45000])

    const payment = await recordPayment(db, orderId, { amount_minor: 20000, method: 'cash' })
    expect(payment.kind).toBe('payment')

    const refund = await recordPayment(db, orderId, {
      amount_minor: 5000,
      method: 'cash',
      kind: 'refund',
    })
    expect(refund.kind).toBe('refund')
    expect(refund.amount_minor).toBe(5000)
  })
})

describe('voidPayment', () => {
  it('records who voided it and why, before the soft delete', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    const payment = await recordPayment(db, orderId, { amount_minor: 20000, method: 'cash' })
    const staffId = crypto.randomUUID()

    await voidPayment(db, payment.id, 'entered twice', staffId)

    expect(await db.payments.findOne(payment.id).exec()).toBeNull()

    const [raw] = await db.payments.storageInstance.findDocumentsById([payment.id], true)
    expect(raw?._deleted).toBe(true)
    expect(raw?.voided_by).toBe(staffId)
    expect(raw?.void_reason).toBe('entered twice')
    expect(raw?.voided_at).toBeTruthy()
  })
})

describe('measurement fields', () => {
  it('keeps a retired field queryable so recorded values still resolve', async () => {
    const db = await freshDatabase()
    const field = await createMeasurementField(db, shopId, { label: 'Chest', display_order: 0 })

    await retireMeasurementField(db, field.id)

    // The bug this replaces: doc.remove() soft-deletes, RxDB excludes
    // soft-deleted docs from queries, and every recorded chest measurement
    // becomes unlabellable.
    const found = await db.measurement_fields.findOne(field.id).exec()
    expect(found).not.toBeNull()
    expect(found?.active).toBe(false)
  })

  it('does not touch _deleted when retiring', async () => {
    const db = await freshDatabase()
    const field = await createMeasurementField(db, shopId, { label: 'Chest', display_order: 0 })

    await retireMeasurementField(db, field.id)

    const [raw] = await db.measurement_fields.storageInstance.findDocumentsById([field.id], true)
    expect(raw?._deleted).toBe(false)
  })

  it('reactivateMeasurementField undoes a retirement, values untouched throughout', async () => {
    const db = await freshDatabase()
    const client = await createClient(db, shopId, { name: 'Mrs. Okello' })
    const field = await createMeasurementField(db, shopId, { label: 'Chest', display_order: 0 })
    await saveMeasurements(db, client.id, { [field.id]: 40 })

    await retireMeasurementField(db, field.id)
    expect((await db.measurement_fields.findOne(field.id).exec())?.active).toBe(false)

    await reactivateMeasurementField(db, field.id)

    const found = await db.measurement_fields.findOne(field.id).exec()
    expect(found?.active).toBe(true)
    const profile = await db.measurement_profiles.findOne({ selector: { client_id: client.id } }).exec()
    expect(profile?.values).toEqual({ [field.id]: 40 })
  })
})

describe('unit measurements', () => {
  it('does not change a unit snapshot when the client profile is later edited', async () => {
    const { db, clientId, unitId } = await unitWithMeasurements({ chest: 72 })
    await saveMeasurements(db, clientId, { chest: 99 })

    const unit = await db.order_units.findOne(unitId).exec()
    expect(unit?.measurements).toEqual({ chest: 72 })
  })

  it('copyMeasurementsFromClient pulls the client profile onto the unit', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    const client = await createClient(db, shopId, { name: 'Mrs. Okello' })
    await saveMeasurements(db, client.id, { chest: 88 })

    const units = await db.order_units.find({ selector: { order_id: orderId } }).exec()
    const unitId = units[0]!.id

    await copyMeasurementsFromClient(db, unitId, client.id)

    const unit = await db.order_units.findOne(unitId).exec()
    expect(unit?.measurements).toEqual({ chest: 88 })
  })

  it('copyMeasurementsFromClient is a no-op when the client has no profile yet', async () => {
    const { db, clientId, unitId } = await unitWithMeasurements({ chest: 72 })

    await copyMeasurementsFromClient(db, unitId, clientId)

    // A missing profile must never overwrite a unit's real values with {}.
    const unit = await db.order_units.findOne(unitId).exec()
    expect(unit?.measurements).toEqual({ chest: 72 })
  })

  it('saveUnitMeasurementsToClient pushes the snapshot up without automatic sync either way', async () => {
    const { db, clientId, unitId } = await unitWithMeasurements({ chest: 72 })

    await saveUnitMeasurementsToClient(db, unitId, clientId)

    const profile = await db.measurement_profiles.findOne({ selector: { client_id: clientId } }).exec()
    expect(profile?.values).toEqual({ chest: 72 })

    // One-way: pushing to the client must not retroactively alter the unit.
    await saveMeasurements(db, clientId, { chest: 100 })
    const unit = await db.order_units.findOne(unitId).exec()
    expect(unit?.measurements).toEqual({ chest: 72 })
  })
})
