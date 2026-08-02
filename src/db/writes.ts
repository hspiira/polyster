/**
 * Every write the app makes, in one place.
 *
 * Screens call these rather than touching collections directly, so that the
 * things easy to forget -- generating an id, stamping `created_at`, recording
 * who did it, writing the audit row -- cannot be forgotten in one screen and
 * remembered in another.
 *
 * ## On transactions
 *
 * RxDB has no cross-collection transaction, so "advance the stage and record
 * the history" cannot be atomic. The order below is deliberate: the history
 * row is written **first**. If the second write fails, the shop is left with a
 * history entry for a transition that did not happen -- visible, harmless, and
 * correctable. The other ordering fails the other way, silently dropping the
 * audit record, which is the one thing that table exists to guarantee.
 *
 * An earlier draft of IMPLEMENTATION_PLAN.md said these happen "in the same
 * transaction". They cannot; this comment is the correction.
 */
import type { AppDatabase } from './database'
import {
  DEFAULT_COUNTRY,
  type ClientDoc,
  type FabricSource,
  type MeasurementFieldDoc,
  type MeasurementFieldType,
  type MessageTemplate,
  type OrderDoc,
  type OrderStage,
  type OrderType,
  type OrderUnitDoc,
  type PaymentDoc,
  type PaymentKind,
  type PaymentMethod,
  type ShopDoc,
  type StaffDoc,
  type StaffRole,
} from './schema'
import { hashPin } from '../lib/pin'
import { DEFAULT_CURRENCY } from '../lib/money'
import { generateOrderReference } from '../lib/orderReference'
import { DEFAULT_LOCK_AFTER_MINUTES } from '../lib/lockPolicy'

function newId(): string {
  return crypto.randomUUID()
}

function now(): string {
  return new Date().toISOString()
}

// ---------------------------------------------------------------- clients

export async function createClient(
  db: AppDatabase,
  shopId: string,
  input: { name: string; phone?: string; notes?: string },
): Promise<ClientDoc> {
  const timestamp = now()
  const doc: ClientDoc = {
    id: newId(),
    shop_id: shopId,
    name: input.name.trim(),
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  await db.clients.insert(doc)
  return doc
}

export async function updateClient(
  db: AppDatabase,
  clientId: string,
  input: { name: string; phone?: string; notes?: string },
): Promise<void> {
  const doc = await db.clients.findOne(clientId).exec()
  if (!doc) throw new Error('That client no longer exists on this device.')

  await doc.patch({
    name: input.name.trim(),
    phone: input.phone?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  })
}

/** Soft delete. Never a hard delete -- other devices may not have synced yet. */
export async function archiveClient(db: AppDatabase, clientId: string): Promise<void> {
  const doc = await db.clients.findOne(clientId).exec()
  await doc?.remove()
}

// ----------------------------------------------------------- measurements

export async function saveMeasurements(
  db: AppDatabase,
  clientId: string,
  values: Record<string, string | number>,
  staffId?: string,
): Promise<void> {
  const existing = await db.measurement_profiles.findOne({ selector: { client_id: clientId } }).exec()

  if (existing) {
    await existing.patch({ values, updated_at: now(), updated_by: staffId })
    return
  }

  const timestamp = now()
  await db.measurement_profiles.insert({
    id: newId(),
    client_id: clientId,
    values,
    created_at: timestamp,
    updated_at: timestamp,
    ...(staffId ? { updated_by: staffId } : {}),
  })
}

export async function createMeasurementField(
  db: AppDatabase,
  shopId: string,
  input: {
    label: string
    unit?: string
    display_order: number
    field_type?: MeasurementFieldType
    group_label?: string
  },
): Promise<MeasurementFieldDoc> {
  const timestamp = now()
  const doc: MeasurementFieldDoc = {
    id: newId(),
    shop_id: shopId,
    label: input.label.trim(),
    display_order: input.display_order,
    // Existing callers predate the type distinction; 'number' matches the
    // migration's own backfill default.
    field_type: input.field_type ?? 'number',
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.unit?.trim() ? { unit: input.unit.trim() } : {}),
    ...(input.group_label?.trim() ? { group_label: input.group_label.trim() } : {}),
  }
  await db.measurement_fields.insert(doc)
  return doc
}

export async function reorderMeasurementFields(
  db: AppDatabase,
  orderedIds: readonly string[],
): Promise<void> {
  await Promise.all(
    orderedIds.map(async (id, index) => {
      const doc = await db.measurement_fields.findOne(id).exec()
      await doc?.patch({ display_order: index })
    }),
  )
}

export async function retireMeasurementField(db: AppDatabase, fieldId: string): Promise<void> {
  // Patched, not removed: doc.remove() is a soft delete that RxDB excludes
  // from query results, which would make recorded values unlabellable.
  const doc = await db.measurement_fields.findOne(fieldId).exec()
  await doc?.patch({ active: false, updated_at: now() })
}

/** Undoes retireMeasurementField -- a field can be brought back into new forms. */
export async function reactivateMeasurementField(db: AppDatabase, fieldId: string): Promise<void> {
  const doc = await db.measurement_fields.findOne(fieldId).exec()
  await doc?.patch({ active: true, updated_at: now() })
}

/**
 * Copies a client's saved profile onto one order unit's frozen snapshot.
 * Explicit and one-way: a later edit to the client's profile must never
 * reach back and rewrite this unit. A no-op with no profile yet, rather than
 * overwriting a unit's real values with an empty one.
 */
export async function copyMeasurementsFromClient(
  db: AppDatabase,
  unitId: string,
  clientId: string,
): Promise<void> {
  const profile = await db.measurement_profiles.findOne({ selector: { client_id: clientId } }).exec()
  if (!profile) return
  await updateOrderUnit(db, unitId, { measurements: profile.toJSON().values })
}

/**
 * Writes a unit's snapshot up to the client's profile, the reverse direction.
 * Reuses saveMeasurements so create-or-update logic lives in one place.
 */
export async function saveUnitMeasurementsToClient(
  db: AppDatabase,
  unitId: string,
  clientId: string,
  staffId?: string,
): Promise<void> {
  const unit = await db.order_units.findOne(unitId).exec()
  if (!unit) throw new Error('That item no longer exists on this device.')
  await saveMeasurements(db, clientId, unit.toJSON().measurements, staffId)
}

// ----------------------------------------------------------------- orders

export interface NewOrderInput {
  client_id: string
  order_type: OrderType
  item_description: string
  price_total_minor: number
  pickup_due_date: string
  return_due_date?: string
  notes?: string
}

/**
 * Every order carries at least one unit. A single-item order (the only kind
 * this form creates) gets exactly one, at position 0. `summary` and
 * `price_total_minor` are derived from that unit via recalculateOrder once it
 * exists, not set directly here -- see invariant 1.
 */
export async function createOrder(
  db: AppDatabase,
  shopId: string,
  input: NewOrderInput,
  staffId?: string,
): Promise<OrderDoc> {
  const timestamp = now()
  const shop = await db.shops.findOne(shopId).exec()
  const description = input.item_description.trim()

  const doc: OrderDoc = {
    id: newId(),
    shop_id: shopId,
    client_id: input.client_id,
    order_type: input.order_type,
    reference: generateOrderReference(),
    currency: shop?.currency ?? DEFAULT_CURRENCY,
    // Placeholders only, to satisfy the schema's required fields before the
    // unit exists -- recalculateOrder below overwrites both.
    summary: description,
    stage: 'measured',
    price_total_minor: input.price_total_minor,
    price_adjustment_minor: 0,
    rental_deposit_minor: 0,
    pickup_due_date: input.pickup_due_date,
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.return_due_date ? { return_due_date: input.return_due_date } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(staffId ? { created_by: staffId } : {}),
  }

  await db.orders.insert(doc)

  // The opening stage is part of the trail too. Without it, an order's history
  // starts at its first change rather than at its creation. Written before the
  // unit, per the module header: the history row is the one write that must
  // never be silently dropped.
  await db.order_stage_history.insert({
    id: newId(),
    order_id: doc.id,
    to_stage: 'measured',
    changed_at: timestamp,
    ...(staffId ? { changed_by: staffId } : {}),
  })

  await db.order_units.insert({
    id: crypto.randomUUID(),
    order_id: doc.id,
    position: 0,
    item_description: description,
    price_minor: input.price_total_minor,
    measurements: {},
    fabric_source: 'shop',
    done: false,
    created_at: timestamp,
    updated_at: timestamp,
  })

  // recalculateOrder is the only writer of summary/price_total_minor
  // (invariant 1); the values above are placeholders it now replaces.
  await recalculateOrder(db, doc.id)

  const saved = await db.orders.findOne(doc.id).exec()
  if (!saved) throw new Error('Order was created but could not be reloaded.')
  return saved.toJSON()
}

export interface OrderHeaderInput {
  client_id: string
  order_type: OrderType
  pickup_due_date: string
  return_due_date?: string
  notes?: string
}

/**
 * The order form's header save. Touches only client, type, dates and notes --
 * never a unit, never price_total_minor or summary -- so it works regardless
 * of how many units the order has, unlike the single-item updater this
 * replaced.
 */
export async function updateOrderHeader(
  db: AppDatabase,
  orderId: string,
  input: OrderHeaderInput,
): Promise<void> {
  const doc = await db.orders.findOne(orderId).exec()
  if (!doc) throw new Error('That order no longer exists on this device.')

  await doc.patch({
    client_id: input.client_id,
    order_type: input.order_type,
    pickup_due_date: input.pickup_due_date,
    return_due_date: input.return_due_date || undefined,
    notes: input.notes?.trim() || undefined,
    updated_at: now(),
  })
}

/** The column each terminal stage stamps, alongside `stage` itself. */
const TERMINAL_STAGE_TIMESTAMP_FIELD: Partial<Record<OrderStage, keyof OrderDoc>> = {
  picked_up: 'picked_up_at',
  returned: 'returned_at',
  cancelled: 'cancelled_at',
}

/**
 * Advances an order to a new stage and records who did it.
 *
 * History first -- see the transaction note at the top of this file. Entering
 * a terminal stage also stamps its own column, in the same patch as `stage`,
 * so the two can never disagree. `extraPatch` folds a caller's own fields
 * (e.g. cancelOrder's reason) into that same single patch, for the same
 * reason: two patches invite a crash between them leaving one written and not
 * the other. Spread before this function's own fields, so a caller can never
 * override the stage or its timestamp, by accident or otherwise.
 */
export async function changeOrderStage(
  db: AppDatabase,
  orderId: string,
  toStage: OrderStage,
  staffId?: string,
  extraPatch?: Partial<OrderDoc>,
): Promise<void> {
  const doc = await db.orders.findOne(orderId).exec()
  if (!doc) throw new Error('That order no longer exists on this device.')

  const fromStage = doc.stage
  if (fromStage === toStage) return

  const timestamp = now()

  await db.order_stage_history.insert({
    id: newId(),
    order_id: orderId,
    from_stage: fromStage,
    to_stage: toStage,
    changed_at: timestamp,
    ...(staffId ? { changed_by: staffId } : {}),
  })

  const timestampField = TERMINAL_STAGE_TIMESTAMP_FIELD[toStage]

  await doc.patch({
    ...extraPatch,
    stage: toStage,
    updated_at: timestamp,
    ...(timestampField ? { [timestampField]: timestamp } : {}),
  })
}

/**
 * Cancels an order: routes through changeOrderStage so the stage history stays
 * the one place that logs the transition, and the reason lands in the same
 * patch as the stage change rather than a second write that could go missing.
 */
export async function cancelOrder(
  db: AppDatabase,
  orderId: string,
  reason: string,
  staffId?: string,
): Promise<void> {
  await changeOrderStage(db, orderId, 'cancelled', staffId, {
    cancellation_reason: reason.trim() || undefined,
  })
}

/**
 * Soft-deletes the order, then its units. Order first: an archived order left
 * with live units is orphaned but harmless, whereas a live order interrupted
 * between these two awaits with zero live units is indistinguishable from one
 * that predates order_units -- backfillOrderUnits would fabricate a unit for
 * it from stale order data on the next app start.
 */
export async function archiveOrder(db: AppDatabase, orderId: string): Promise<void> {
  const doc = await db.orders.findOne(orderId).exec()
  await doc?.remove()

  const units = await db.order_units.find({ selector: { order_id: orderId } }).exec()
  await Promise.all(units.map((unit) => unit.remove()))
}

// ----------------------------------------------------------- order units

/** Fields a caller supplies for a unit; `position` and `done` are managed here. */
export interface OrderUnitInput {
  wearer_name?: string
  item_description: string
  price_minor: number
  measurements?: OrderUnitDoc['measurements']
  fabric_source?: FabricSource
  notes?: string
}

/** Invariant 3: first description up to its comma, plus a count of the rest. */
export function buildSummary(descriptions: readonly string[]): string {
  const [first, ...rest] = descriptions
  if (!first) return ''
  const head = first.split(',')[0]!.trim()
  return rest.length > 0 ? `${head} +${rest.length}` : head
}

/**
 * Rebuilds the caches on an order. The only thing permitted to set
 * price_total_minor or summary -- see spec invariant 1.
 */
export async function recalculateOrder(db: AppDatabase, orderId: string): Promise<void> {
  const order = await db.orders.findOne(orderId).exec()
  if (!order) throw new Error('That order no longer exists on this device.')

  const units = await db.order_units
    .find({ selector: { order_id: orderId }, sort: [{ position: 'asc' }] })
    .exec()

  const subtotal = units.reduce((sum, unit) => sum + unit.price_minor, 0)
  const total = subtotal + order.price_adjustment_minor

  // Backstop for paths that change unit prices under an existing adjustment;
  // setOrderAdjustment itself checks before it patches (see below).
  if (total < 0) {
    throw new Error('That discount is larger than the order total.')
  }

  await order.patch({
    price_total_minor: total,
    summary: buildSummary(units.map((unit) => unit.item_description)),
    updated_at: now(),
  })
}

export async function addOrderUnit(
  db: AppDatabase,
  orderId: string,
  input: OrderUnitInput,
): Promise<OrderUnitDoc> {
  const timestamp = now()
  const position = await db.order_units.count({ selector: { order_id: orderId } }).exec()

  const doc: OrderUnitDoc = {
    id: newId(),
    order_id: orderId,
    position,
    item_description: input.item_description.trim(),
    price_minor: input.price_minor,
    measurements: input.measurements ?? {},
    fabric_source: input.fabric_source ?? 'shop',
    done: false,
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.wearer_name?.trim() ? { wearer_name: input.wearer_name.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }

  await db.order_units.insert(doc)
  await recalculateOrder(db, orderId)
  return doc
}

export async function updateOrderUnit(
  db: AppDatabase,
  unitId: string,
  input: Partial<OrderUnitInput>,
): Promise<void> {
  const unit = await db.order_units.findOne(unitId).exec()
  if (!unit) throw new Error('That item no longer exists on this device.')

  await unit.patch({
    ...(input.item_description !== undefined
      ? { item_description: input.item_description.trim() }
      : {}),
    ...(input.price_minor !== undefined ? { price_minor: input.price_minor } : {}),
    ...(input.wearer_name !== undefined
      ? { wearer_name: input.wearer_name.trim() || undefined }
      : {}),
    ...(input.measurements !== undefined ? { measurements: input.measurements } : {}),
    ...(input.fabric_source !== undefined ? { fabric_source: input.fabric_source } : {}),
    ...(input.notes !== undefined ? { notes: input.notes.trim() || undefined } : {}),
    updated_at: now(),
  })

  await recalculateOrder(db, unit.order_id)
}

/** Refuses to remove an order's last unit -- every order keeps at least one (invariant 2). */
export async function removeOrderUnit(db: AppDatabase, unitId: string): Promise<void> {
  const unit = await db.order_units.findOne(unitId).exec()
  if (!unit) throw new Error('That item no longer exists on this device.')

  const count = await db.order_units.count({ selector: { order_id: unit.order_id } }).exec()
  if (count <= 1) throw new Error('An order needs at least one item.')

  await unit.remove()
  await recalculateOrder(db, unit.order_id)
}

export async function reorderOrderUnits(
  db: AppDatabase,
  orderId: string,
  orderedIds: readonly string[],
): Promise<void> {
  await Promise.all(
    orderedIds.map(async (id, index) => {
      const doc = await db.order_units.findOne(id).exec()
      await doc?.patch({ position: index, updated_at: now() })
    }),
  )
  await recalculateOrder(db, orderId)
}

export async function setUnitDone(db: AppDatabase, unitId: string, done: boolean): Promise<void> {
  const unit = await db.order_units.findOne(unitId).exec()
  if (!unit) throw new Error('That item no longer exists on this device.')

  await unit.patch({ done, updated_at: now() })
  await recalculateOrder(db, unit.order_id)
}

/**
 * Sets the order's adjustment (a discount, late fee, or damage charge).
 * Checked here, not left to recalculateOrder: patching first and letting the
 * recalculation throw would persist the adjustment while price_total_minor
 * still held the old figure, which is invariant 1 broken on disk.
 */
export async function setOrderAdjustment(
  db: AppDatabase,
  orderId: string,
  minor: number,
  reason?: string,
): Promise<void> {
  const order = await db.orders.findOne(orderId).exec()
  if (!order) throw new Error('That order no longer exists on this device.')

  const units = await db.order_units.find({ selector: { order_id: orderId } }).exec()
  const subtotal = units.reduce((sum, unit) => sum + unit.price_minor, 0)

  if (subtotal + minor < 0) throw new Error('That discount is larger than the order total.')

  await order.patch({ price_adjustment_minor: minor, adjustment_reason: reason || undefined })
  await recalculateOrder(db, orderId)
}

// --------------------------------------------------------------- payments

/**
 * Records a payment or, with `kind: 'refund'`, a refund. A refund is always a
 * positive amount -- the schema's `exclusiveMinimum: 0` forces this for both
 * kinds -- never a negative payment row.
 */
export async function recordPayment(
  db: AppDatabase,
  orderId: string,
  input: { amount_minor: number; method: PaymentMethod; notes?: string; kind?: PaymentKind },
  staffId?: string,
): Promise<PaymentDoc> {
  const timestamp = now()
  const doc: PaymentDoc = {
    id: newId(),
    order_id: orderId,
    amount_minor: input.amount_minor,
    kind: input.kind ?? 'payment',
    payment_date: timestamp,
    created_at: timestamp,
    method: input.method,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(staffId ? { recorded_by: staffId } : {}),
  }
  await db.payments.insert(doc)
  return doc
}

/**
 * Voids a payment. A soft delete, which is what the `amount_minor > 0`
 * constraint in the migration forces: a mistaken entry is retracted, never
 * cancelled out with a negative row. The balance calculation already ignores
 * deleted payments, so the figure corrects itself.
 *
 * The void trail is patched before the remove -- a removed document cannot be
 * patched afterwards.
 */
export async function voidPayment(
  db: AppDatabase,
  paymentId: string,
  reason?: string,
  staffId?: string,
): Promise<void> {
  const doc = await db.payments.findOne(paymentId).exec()
  if (!doc) return

  // patch() returns the updated revision -- remove() must be called on that,
  // not the stale `doc`, or RxDB rejects it as a revision conflict.
  const patched = await doc.patch({
    voided_at: now(),
    ...(staffId ? { voided_by: staffId } : {}),
    ...(reason?.trim() ? { void_reason: reason.trim() } : {}),
  })
  await patched.remove()
}

// ------------------------------------------------------------- message log

/**
 * Records that a WhatsApp message was sent -- intent, not delivery. A wa.me
 * link hands off to WhatsApp and this app never learns what happened next.
 */
export async function logMessage(
  db: AppDatabase,
  input: {
    client_id: string
    order_id?: string
    template: MessageTemplate
    order_stage?: OrderStage
  },
  staffId?: string,
): Promise<void> {
  await db.message_log.insert({
    id: newId(),
    client_id: input.client_id,
    channel: 'whatsapp',
    template: input.template,
    sent_at: now(),
    ...(input.order_id ? { order_id: input.order_id } : {}),
    ...(input.order_stage ? { order_stage: input.order_stage } : {}),
    ...(staffId ? { sent_by: staffId } : {}),
  })
}

// ------------------------------------------------------------------ staff

export async function createStaff(
  db: AppDatabase,
  shopId: string,
  input: { name: string; pin: string; role: StaffRole },
): Promise<StaffDoc> {
  const timestamp = now()
  const doc: StaffDoc = {
    id: newId(),
    shop_id: shopId,
    name: input.name.trim(),
    pin_hash: await hashPin(input.pin),
    role: input.role,
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
  }
  await db.staff.insert(doc)
  return doc
}

export async function setStaffPin(db: AppDatabase, staffId: string, pin: string): Promise<void> {
  const doc = await db.staff.findOne(staffId).exec()
  if (!doc) throw new Error('That staff member no longer exists on this device.')
  await doc.patch({ pin_hash: await hashPin(pin) })
}

/**
 * Deactivates rather than deletes. `orders.created_by` and
 * `payments.recorded_by` point at staff rows, and a departed employee's name
 * still needs to render on the orders they took.
 */
export async function setStaffActive(
  db: AppDatabase,
  staffId: string,
  active: boolean,
): Promise<void> {
  const doc = await db.staff.findOne(staffId).exec()
  await doc?.patch({ active })
}

// ------------------------------------------------------------------- shop

/** Creates a shop locally, online or offline. See ARCHITECTURE.md D14. */
export async function createShop(
  db: AppDatabase,
  input: { name: string; whatsapp_number?: string; supabaseAuthUserId?: string },
): Promise<ShopDoc> {
  const timestamp = now()
  const doc: ShopDoc = {
    id: newId(),
    name: input.name.trim(),
    whatsapp_number: input.whatsapp_number?.trim() || undefined,
    supabase_auth_user_id: input.supabaseAuthUserId,
    currency: DEFAULT_CURRENCY,
    country: DEFAULT_COUNTRY,
    lock_after_minutes: DEFAULT_LOCK_AFTER_MINUTES,
    created_at: timestamp,
    updated_at: timestamp,
  }
  await db.shops.insert(doc)
  return doc
}

export async function updateShop(
  db: AppDatabase,
  shopId: string,
  input: {
    name: string
    whatsapp_number?: string
    currency?: string
    lock_after_minutes?: number
  },
): Promise<void> {
  const doc = await db.shops.findOne(shopId).exec()
  if (!doc) throw new Error('Shop record not found on this device.')

  await doc.patch({
    name: input.name.trim(),
    whatsapp_number: input.whatsapp_number?.trim() || undefined,
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.lock_after_minutes !== undefined
      ? { lock_after_minutes: input.lock_after_minutes }
      : {}),
  })
}
