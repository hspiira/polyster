import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type AppDatabase } from './database'
import { backfillOrderUnits } from './backfill'
import { addDays, today } from '../lib/dates'
import {
  addOrderUnit,
  archiveOrder,
  buildSummary,
  cancelOrder,
  changeOrderStage,
  copyMeasurementsFromClient,
  createClient,
  createMeasurementField,
  createOrder,
  logMessage,
  reactivateMeasurementField,
  recordPayment,
  removeOrderUnit,
  reorderOrderUnits,
  retireMeasurementField,
  saveMeasurements,
  saveUnitMeasurementsToClient,
  setFeatureEnabled,
  setOrderAdjustment,
  setUnitDone,
  updateOrderHeader,
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

describe('updateOrderHeader', () => {
  // updateOrder used to refuse this outright (the guard this replaces);
  // updateOrderHeader's whole point is that a multi-unit order's header is
  // still editable, precisely because it never goes near a unit.
  it('patches header fields on a multi-unit order without touching its units, price or summary', async () => {
    const { db, orderId, unitIds } = await orderWithUnits([45000])
    const secondUnit = await addOrderUnit(db, orderId, {
      item_description: 'Gomesi, gold trim',
      price_minor: 80000,
    })
    const before = await db.orders.findOne(orderId).exec()
    const originalTotal = before?.price_total_minor
    const originalSummary = before?.summary
    const newClientId = crypto.randomUUID()

    await updateOrderHeader(db, orderId, {
      client_id: newClientId,
      order_type: 'tailor_made',
      pickup_due_date: '2030-01-01',
      notes: 'should land',
    })

    const after = await db.orders.findOne(orderId).exec()
    expect(after?.client_id).toBe(newClientId)
    expect(after?.pickup_due_date).toBe('2030-01-01')
    expect(after?.notes).toBe('should land')
    expect(after?.price_total_minor).toBe(originalTotal)
    expect(after?.summary).toBe(originalSummary)

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

describe('archiveOrder', () => {
  it('soft-deletes the order and its units, order first', async () => {
    const { db, orderId, unitIds } = await orderWithUnits([45000, 80000])

    await archiveOrder(db, orderId)

    expect(await db.orders.findOne(orderId).exec()).toBeNull()
    expect(await db.order_units.find({ selector: { order_id: orderId } }).exec()).toEqual([])

    const [rawOrder] = await db.orders.storageInstance.findDocumentsById([orderId], true)
    expect(rawOrder?._deleted).toBe(true)
    for (const unitId of unitIds) {
      const [rawUnit] = await db.order_units.storageInstance.findDocumentsById([unitId], true)
      expect(rawUnit?._deleted).toBe(true)
    }
  })

  // The ordering this test guards: backfillOrderUnits must never resurrect an
  // order archived this way, even reading straight after the archive.
  it('leaves nothing for backfillOrderUnits to fabricate a unit for', async () => {
    const { db, orderId } = await orderWithUnits([45000])

    await archiveOrder(db, orderId)

    expect(await backfillOrderUnits(db)).toBe(0)
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

  it('takes instalments up to the price', async () => {
    const { db, orderId } = await orderWithUnits([45000])

    await recordPayment(db, orderId, { amount_minor: 20000, method: 'cash' })
    await recordPayment(db, orderId, { amount_minor: 25000, method: 'cash' })

    const payments = await db.payments.find({ selector: { order_id: orderId } }).exec()
    expect(payments.reduce((sum, p) => sum + p.amount_minor, 0)).toBe(45000)
  })

  // The bug: instalments could add up past the order total.
  it('refuses an instalment that would take the total past the price', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    await recordPayment(db, orderId, { amount_minor: 40000, method: 'cash' })

    await expect(
      recordPayment(db, orderId, { amount_minor: 5001, method: 'cash' }),
    ).rejects.toThrow(/more than the/)

    const payments = await db.payments.find({ selector: { order_id: orderId } }).exec()
    expect(payments).toHaveLength(1)
  })

  // The other half: a settled order could still take money.
  it('refuses any payment once the order is settled', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    await recordPayment(db, orderId, { amount_minor: 45000, method: 'cash' })

    await expect(recordPayment(db, orderId, { amount_minor: 1, method: 'cash' })).rejects.toThrow(
      /fully paid/,
    )
  })

  // Voiding frees the room back up, because the balance ignores deleted rows.
  it('lets a payment through again after an earlier one is voided', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    const first = await recordPayment(db, orderId, { amount_minor: 45000, method: 'cash' })

    await voidPayment(db, first.id)
    await expect(
      recordPayment(db, orderId, { amount_minor: 45000, method: 'cash' }),
    ).resolves.toBeTruthy()
  })

  it('refuses to refund more than has been taken', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    await recordPayment(db, orderId, { amount_minor: 20000, method: 'cash' })

    await expect(
      recordPayment(db, orderId, { amount_minor: 20001, method: 'cash', kind: 'refund' }),
    ).rejects.toThrow(/only refund up to/)
  })

  // A refund frees room, so the order can take money again.
  it('lets a payment through after a refund reopens the balance', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    await recordPayment(db, orderId, { amount_minor: 45000, method: 'cash' })
    await recordPayment(db, orderId, { amount_minor: 15000, method: 'cash', kind: 'refund' })

    await expect(
      recordPayment(db, orderId, { amount_minor: 15000, method: 'cash' }),
    ).resolves.toBeTruthy()
  })

  it('backdates payment_date while created_at keeps the real entry time', async () => {
    const { db, orderId } = await orderWithUnits([45000])

    const payment = await recordPayment(db, orderId, {
      amount_minor: 20000,
      method: 'cash',
      payment_date: '2026-07-02',
    })

    expect(payment.payment_date.slice(0, 10)).toBe('2026-07-02')
    expect(payment.created_at.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10))
  })

  // `today()` is the device's local day, so tomorrow has to be derived the same
  // way -- a UTC-based one is the same day here whenever the offset is positive.
  it('refuses a payment dated in the future', async () => {
    const { db, orderId } = await orderWithUnits([45000])

    await expect(
      recordPayment(db, orderId, {
        amount_minor: 20000,
        method: 'cash',
        payment_date: addDays(today(), 1),
      }),
    ).rejects.toThrow(/dated in the future/)
  })

  it('refuses money against an order with nothing on it yet', async () => {
    const { db, orderId } = await orderWithUnits([])

    await expect(recordPayment(db, orderId, { amount_minor: 1000, method: 'cash' })).rejects.toThrow(
      /before taking money against it/,
    )
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

describe('logMessage', () => {
  it('records a sent reminder against the order and the client', async () => {
    const db = await freshDatabase()
    const clientId = crypto.randomUUID()
    const orderId = crypto.randomUUID()

    await logMessage(db, { client_id: clientId, order_id: orderId, template: 'balance_reminder' })

    const logged = await db.message_log.find({ selector: { order_id: orderId } }).exec()
    expect(logged).toHaveLength(1)
    expect(logged[0]?.channel).toBe('whatsapp')
  })

  it('attributes the send to staff when given', async () => {
    const db = await freshDatabase()
    const clientId = crypto.randomUUID()
    const staffId = crypto.randomUUID()

    await logMessage(db, { client_id: clientId, template: 'stage_update', order_stage: 'ready' }, staffId)

    const logged = await db.message_log.find({ selector: { client_id: clientId } }).exec()
    expect(logged[0]?.sent_by).toBe(staffId)
    expect(logged[0]?.order_stage).toBe('ready')
    expect(logged[0]?.order_id).toBeUndefined()
  })
})

describe('setFeatureEnabled', () => {
  it('creates an override row on first toggle', async () => {
    const db = await freshDatabase()

    await setFeatureEnabled(db, shopId, 'catalogue', true)

    const rows = await db.tenant_features.find({ selector: { shop_id: shopId } }).exec()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.feature_key).toBe('catalogue')
    expect(rows[0]?.enabled).toBe(true)
  })

  it('patches the existing row rather than creating a second one', async () => {
    const db = await freshDatabase()

    await setFeatureEnabled(db, shopId, 'catalogue', true)
    await setFeatureEnabled(db, shopId, 'catalogue', false)

    const rows = await db.tenant_features.find({ selector: { shop_id: shopId } }).exec()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.enabled).toBe(false)
  })
})
