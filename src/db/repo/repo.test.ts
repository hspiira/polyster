import { afterEach, describe, expect, it } from 'vitest'
import type { Observable } from 'dexie'
import { createDatabase, type PolysterDatabase } from '../dexie/database'
import { addDays, today } from '../../lib/dates'
import { newId } from '../../lib/ids'
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
  getRow,
  listBy,
  logMessage,
  observeActiveMeasurementFields,
  observeRetiredMeasurementFields,
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
} from './index'

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

function firstOf<T>(source: Observable<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const sub = source.subscribe({
      next: (value) => {
        sub.unsubscribe()
        resolve(value)
      },
      error: reject,
    })
  })
}

const opened: PolysterDatabase[] = []
let counter = 0

function freshDatabase(): PolysterDatabase {
  const db = createDatabase(`repo_${++counter}`)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
})

const shopId = newId()

// Matches the fixtures buildSummary's own tests are pinned against.
const DESCRIPTIONS = ['Kanzu, navy', 'Gomesi, gold trim', 'Shirt, white']

/** A fresh order with one unit per price, added via addOrderUnit in order. */
async function orderWithUnits(
  prices: number[],
): Promise<{ db: PolysterDatabase; orderId: string; unitIds: string[] }> {
  const db = freshDatabase()
  const orderId = newId()
  const timestamp = new Date().toISOString()

  await db.orders.add({
    id: orderId,
    shop_id: shopId,
    client_id: newId(),
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

function units(db: PolysterDatabase, orderId: string) {
  return listBy(db.order_units, 'order_id', orderId, { key: 'position' })
}

/** An order with one unit carrying a measurement snapshot, and its client. */
async function unitWithMeasurements(measurements: Record<string, string | number>) {
  const { db, orderId } = await orderWithUnits([45000])
  const client = await createClient(db, shopId, { name: 'Mrs. Okello' })

  const unitId = (await units(db, orderId))[0]!.id
  await updateOrderUnit(db, unitId, { measurements })

  return { db, clientId: client.id, unitId }
}

describe('recalculateOrder', () => {
  it('keeps price_total_minor equal to the units plus the adjustment', async () => {
    const { db, orderId } = await orderWithUnits([45000, 80000, 30000])
    await setOrderAdjustment(db, orderId, -5000, 'regular customer')

    const order = await db.orders.get(orderId)
    expect(order?.price_total_minor).toBe(150000)
    expect(order?.summary).toBe('Kanzu +2')
  })

  it('recalculates after every unit operation', async () => {
    const { db, orderId, unitIds } = await orderWithUnits([45000, 80000, 30000])

    await updateOrderUnit(db, unitIds[1]!, { item_description: 'Gomesi', price_minor: 90000 })
    expect((await db.orders.get(orderId))?.price_total_minor).toBe(165000)

    await removeOrderUnit(db, unitIds[2]!)
    expect((await db.orders.get(orderId))?.price_total_minor).toBe(135000)
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

    expect((await db.orders.get(orderId))?.summary).toBe('Gomesi +2')
  })

  it('lets setUnitDone toggle done without changing price_total_minor', async () => {
    const { db, orderId, unitIds } = await orderWithUnits([45000, 80000])
    const before = (await db.orders.get(orderId))?.price_total_minor

    await setUnitDone(db, unitIds[0]!, true)

    expect((await db.order_units.get(unitIds[0]!))?.done).toBe(true)
    expect((await db.orders.get(orderId))?.price_total_minor).toBe(before)
  })

  // A soft-deleted unit still sits in the store, so a total that counted it
  // would silently include work that was removed.
  it('ignores a soft-deleted unit', async () => {
    const { db, orderId, unitIds } = await orderWithUnits([45000, 80000])

    await removeOrderUnit(db, unitIds[1]!)

    expect(await db.order_units.get(unitIds[1]!)).toBeDefined()
    expect((await db.orders.get(orderId))?.price_total_minor).toBe(45000)
    expect((await units(db, orderId)).map((unit) => unit.id)).toEqual([unitIds[0]])
  })

  it('numbers a new unit past the removed one rather than reusing its position', async () => {
    const { db, orderId, unitIds } = await orderWithUnits([45000, 80000])
    await removeOrderUnit(db, unitIds[1]!)

    const added = await addOrderUnit(db, orderId, { item_description: 'Shirt', price_minor: 10000 })

    expect(added.position).toBe(1)
    expect((await units(db, orderId)).map((unit) => unit.id)).toEqual([unitIds[0], added.id])
  })
})

describe('createOrder', () => {
  // A second writer of the cache that stores the raw description instead of
  // deriving it is the failure this guards.
  it('derives summary from the unit rather than storing the raw description', async () => {
    const db = freshDatabase()

    const order = await createOrder(db, shopId, {
      client_id: newId(),
      order_type: 'tailor_made',
      item_description: 'Kanzu, navy',
      price_total_minor: 45000,
      pickup_due_date: '2026-08-12',
    })

    expect(order.summary).toBe('Kanzu')
    expect(order.price_total_minor).toBe(45000)

    const created = await units(db, order.id)
    expect(created).toHaveLength(1)
    expect(created[0]?.item_description).toBe('Kanzu, navy')
    expect(created[0]?.price_minor).toBe(45000)
  })

  it('opens the stage history at creation', async () => {
    const db = freshDatabase()
    const order = await createOrder(db, shopId, {
      client_id: newId(),
      order_type: 'tailor_made',
      item_description: 'Kanzu',
      price_total_minor: 45000,
      pickup_due_date: '2026-08-12',
    })

    const history = await listBy(db.order_stage_history, 'order_id', order.id)
    expect(history).toHaveLength(1)
    expect(history[0]?.to_stage).toBe('measured')
    expect(history[0]?.from_stage).toBeUndefined()
  })
})

describe('updateOrderHeader', () => {
  // A multi-unit order's header stays editable, because it never touches a unit.
  it('patches header fields without touching its units, price or summary', async () => {
    const { db, orderId, unitIds } = await orderWithUnits([45000])
    const secondUnit = await addOrderUnit(db, orderId, {
      item_description: 'Gomesi, gold trim',
      price_minor: 80000,
    })
    const before = await db.orders.get(orderId)
    const newClientId = newId()

    await updateOrderHeader(db, orderId, {
      client_id: newClientId,
      order_type: 'tailor_made',
      pickup_due_date: '2030-01-01',
      notes: 'should land',
    })

    const after = await db.orders.get(orderId)
    expect(after?.client_id).toBe(newClientId)
    expect(after?.pickup_due_date).toBe('2030-01-01')
    expect(after?.notes).toBe('should land')
    expect(after?.price_total_minor).toBe(before?.price_total_minor)
    expect(after?.summary).toBe(before?.summary)

    expect((await db.order_units.get(unitIds[0]!))?.price_minor).toBe(45000)
    expect((await db.order_units.get(secondUnit.id))?.price_minor).toBe(80000)
  })
})

describe('changeOrderStage', () => {
  it('stamps only the terminal timestamp matching the stage entered', async () => {
    const { db, orderId } = await orderWithUnits([45000])

    await changeOrderStage(db, orderId, 'ready')
    let order = await db.orders.get(orderId)
    expect(order?.stage).toBe('ready')
    expect(order?.picked_up_at).toBeUndefined()

    await changeOrderStage(db, orderId, 'picked_up')
    order = await db.orders.get(orderId)
    expect(order?.stage).toBe('picked_up')
    expect(order?.picked_up_at).toBeTruthy()
    expect(order?.returned_at).toBeUndefined()
  })

  it('never lets an extraPatch override the stage or its timestamp', async () => {
    const { db, orderId } = await orderWithUnits([45000])

    await changeOrderStage(db, orderId, 'cancelled', undefined, {
      stage: 'ready',
      cancelled_at: '2000-01-01T00:00:00.000Z',
    })

    const order = await db.orders.get(orderId)
    expect(order?.stage).toBe('cancelled')
    expect(order?.cancelled_at).not.toBe('2000-01-01T00:00:00.000Z')
    expect(order?.cancelled_at).toBeTruthy()
  })

  it('does nothing when the stage is already the one asked for', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    await changeOrderStage(db, orderId, 'ready')
    const before = await listBy(db.order_stage_history, 'order_id', orderId)

    await changeOrderStage(db, orderId, 'ready')

    expect(await listBy(db.order_stage_history, 'order_id', orderId)).toHaveLength(before.length)
  })
})

describe('cancelOrder', () => {
  it('moves the order to cancelled, stamps it, and records the reason', async () => {
    const { db, orderId } = await orderWithUnits([45000])

    await cancelOrder(db, orderId, 'client changed their mind')

    const order = await db.orders.get(orderId)
    expect(order?.stage).toBe('cancelled')
    expect(order?.cancelled_at).toBeTruthy()
    expect(order?.cancellation_reason).toBe('client changed their mind')

    const history = await listBy(db.order_stage_history, 'order_id', orderId)
    expect(history.some((entry) => entry.to_stage === 'cancelled')).toBe(true)
  })
})

describe('archiveOrder', () => {
  it('soft-deletes the order and its units, keeping both rows on disk', async () => {
    const { db, orderId, unitIds } = await orderWithUnits([45000, 80000])

    await archiveOrder(db, orderId)

    expect(await getRow(db.orders, orderId)).toBeNull()
    expect(await units(db, orderId)).toEqual([])

    expect((await db.orders.get(orderId))?.deleted_at).toBeTypeOf('string')
    for (const unitId of unitIds) {
      expect((await db.order_units.get(unitId))?.deleted_at).toBeTypeOf('string')
    }
  })

  it('does nothing the second time', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    await archiveOrder(db, orderId)
    const stamp = (await db.orders.get(orderId))?.deleted_at

    await archiveOrder(db, orderId)

    expect((await db.orders.get(orderId))?.deleted_at).toBe(stamp)
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

    const payments = await listBy(db.payments, 'order_id', orderId)
    expect(payments.reduce((sum, p) => sum + p.amount_minor, 0)).toBe(45000)
  })

  it('refuses an instalment that would take the total past the price', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    await recordPayment(db, orderId, { amount_minor: 40000, method: 'cash' })

    await expect(
      recordPayment(db, orderId, { amount_minor: 5001, method: 'cash' }),
    ).rejects.toThrow(/more than the/)

    expect(await listBy(db.payments, 'order_id', orderId)).toHaveLength(1)
  })

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

    await expect(
      recordPayment(db, orderId, { amount_minor: 1000, method: 'cash' }),
    ).rejects.toThrow(/before taking money against it/)
  })
})

describe('voidPayment', () => {
  it('records who voided it and why, and hides it from reads', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    const payment = await recordPayment(db, orderId, { amount_minor: 20000, method: 'cash' })
    const staffId = newId()

    await voidPayment(db, payment.id, 'entered twice', staffId)

    expect(await getRow(db.payments, payment.id)).toBeNull()

    const raw = await db.payments.get(payment.id)
    expect(raw?.deleted_at).toBeTypeOf('string')
    expect(raw?.voided_by).toBe(staffId)
    expect(raw?.void_reason).toBe('entered twice')
    expect(raw?.voided_at).toBeTruthy()
  })

  it('records the void in the audit log', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    const payment = await recordPayment(db, orderId, { amount_minor: 20000, method: 'cash' })

    await voidPayment(db, payment.id, 'entered twice')

    const logged = (await db.events.toArray()).filter(
      (row) => row.entity === 'payments' && row.action === 'deleted',
    )
    expect(logged).toHaveLength(1)
    expect(logged[0]?.summary).toBe('entered twice')
  })
})

describe('measurement fields', () => {
  it('keeps a retired field readable so recorded values still resolve', async () => {
    const db = freshDatabase()
    const field = await createMeasurementField(db, shopId, { label: 'Chest', display_order: 0 })

    await retireMeasurementField(db, field.id)

    const found = await getRow(db.measurement_fields, field.id)
    expect(found).not.toBeNull()
    expect(found?.active).toBe(false)
  })

  it('does not soft-delete when retiring', async () => {
    const db = freshDatabase()
    const field = await createMeasurementField(db, shopId, { label: 'Chest', display_order: 0 })

    await retireMeasurementField(db, field.id)

    expect(await db.measurement_fields.get(field.id)).not.toHaveProperty('deleted_at')
  })

  it('splits the active list from the retired one', async () => {
    const db = freshDatabase()
    const chest = await createMeasurementField(db, shopId, { label: 'Chest', display_order: 0 })
    const waist = await createMeasurementField(db, shopId, { label: 'Waist', display_order: 1 })
    await retireMeasurementField(db, waist.id)

    const active = await firstOf(observeActiveMeasurementFields(db, shopId))
    const retired = await firstOf(observeRetiredMeasurementFields(db, shopId))
    expect(active.map((row) => row.id)).toEqual([chest.id])
    expect(retired.map((row) => row.id)).toEqual([waist.id])
  })

  it('reactivate undoes a retirement, values untouched throughout', async () => {
    const db = freshDatabase()
    const client = await createClient(db, shopId, { name: 'Mrs. Okello' })
    const field = await createMeasurementField(db, shopId, { label: 'Chest', display_order: 0 })
    await saveMeasurements(db, client.id, { [field.id]: 40 })

    await retireMeasurementField(db, field.id)
    expect((await db.measurement_fields.get(field.id))?.active).toBe(false)

    await reactivateMeasurementField(db, field.id)

    expect((await db.measurement_fields.get(field.id))?.active).toBe(true)
    const profile = (await listBy(db.measurement_profiles, 'client_id', client.id))[0]
    expect(profile?.values).toEqual({ [field.id]: 40 })
  })
})

describe('unit measurements', () => {
  it('does not change a unit snapshot when the client profile is later edited', async () => {
    const { db, clientId, unitId } = await unitWithMeasurements({ chest: 72 })
    await saveMeasurements(db, clientId, { chest: 99 })

    expect((await db.order_units.get(unitId))?.measurements).toEqual({ chest: 72 })
  })

  it('copyMeasurementsFromClient pulls the client profile onto the unit', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    const client = await createClient(db, shopId, { name: 'Mrs. Okello' })
    await saveMeasurements(db, client.id, { chest: 88 })

    const unitId = (await units(db, orderId))[0]!.id
    await copyMeasurementsFromClient(db, unitId, client.id)

    expect((await db.order_units.get(unitId))?.measurements).toEqual({ chest: 88 })
  })

  it('copyMeasurementsFromClient is a no-op when the client has no profile yet', async () => {
    const { db, clientId, unitId } = await unitWithMeasurements({ chest: 72 })

    await copyMeasurementsFromClient(db, unitId, clientId)

    // A missing profile must never overwrite a unit's real values with {}.
    expect((await db.order_units.get(unitId))?.measurements).toEqual({ chest: 72 })
  })

  it('saveUnitMeasurementsToClient pushes the snapshot up, and only up', async () => {
    const { db, clientId, unitId } = await unitWithMeasurements({ chest: 72 })

    await saveUnitMeasurementsToClient(db, unitId, clientId)

    const profile = (await listBy(db.measurement_profiles, 'client_id', clientId))[0]
    expect(profile?.values).toEqual({ chest: 72 })

    await saveMeasurements(db, clientId, { chest: 100 })
    expect((await db.order_units.get(unitId))?.measurements).toEqual({ chest: 72 })
  })

  it('saveMeasurements updates the one profile rather than adding a second', async () => {
    const db = freshDatabase()
    const client = await createClient(db, shopId, { name: 'Mrs. Okello' })

    await saveMeasurements(db, client.id, { chest: 40 })
    await saveMeasurements(db, client.id, { chest: 42 })

    const profiles = await listBy(db.measurement_profiles, 'client_id', client.id)
    expect(profiles).toHaveLength(1)
    expect(profiles[0]?.values).toEqual({ chest: 42 })
  })
})

describe('logMessage', () => {
  it('records a sent reminder against the order and the client', async () => {
    const db = freshDatabase()
    const client = await createClient(db, shopId, { name: 'Mrs. Okello' })
    const orderId = newId()

    await logMessage(db, {
      client_id: client.id,
      order_id: orderId,
      template: 'balance_reminder',
    })

    const logged = await listBy(db.message_log, 'order_id', orderId)
    expect(logged).toHaveLength(1)
    expect(logged[0]?.channel).toBe('whatsapp')
  })

  it('attributes the send to staff when given', async () => {
    const db = freshDatabase()
    const client = await createClient(db, shopId, { name: 'Mrs. Okello' })
    const staffId = newId()

    await logMessage(
      db,
      { client_id: client.id, template: 'stage_update', order_stage: 'ready' },
      staffId,
    )

    const logged = await listBy(db.message_log, 'client_id', client.id)
    expect(logged[0]?.sent_by).toBe(staffId)
    expect(logged[0]?.order_stage).toBe('ready')
    expect(logged[0]?.order_id).toBeUndefined()
  })

  // The log lives under the client's shop; without one there is nothing to
  // file the event against.
  it('refuses a client that is not on this device', async () => {
    const db = freshDatabase()
    await expect(
      logMessage(db, { client_id: newId(), template: 'balance_reminder' }),
    ).rejects.toThrow()
  })
})

describe('setFeatureEnabled', () => {
  it('creates an override row on first toggle', async () => {
    const db = freshDatabase()

    await setFeatureEnabled(db, shopId, 'catalogue', true)

    const rows = await listBy(db.tenant_features, 'shop_id', shopId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.feature_key).toBe('catalogue')
    expect(rows[0]?.enabled).toBe(true)
  })

  it('patches the existing row rather than creating a second one', async () => {
    const db = freshDatabase()

    await setFeatureEnabled(db, shopId, 'catalogue', true)
    await setFeatureEnabled(db, shopId, 'catalogue', false)

    const rows = await listBy(db.tenant_features, 'shop_id', shopId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.enabled).toBe(false)
  })
})
