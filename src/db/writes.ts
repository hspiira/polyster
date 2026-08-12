/**
 * Every write the app makes, in one place, so id generation, timestamps and
 * attribution aren't repeated (or forgotten) per screen.
 *
 * RxDB has no cross-collection transaction. Where a stage change and its
 * history row both need writing, the history row goes first -- a failure
 * after that leaves a visible, correctable orphan rather than silently
 * dropping the audit record.
 */
import type { AppDatabase } from './database'
import {
  DEFAULT_COUNTRY,
  type BusinessType,
  type ClientDoc,
  type FabricSource,
  type FeatureKey,
  type MeasurementFieldDoc,
  type MeasurementFieldType,
  type CustomerType,
  type MessageTemplate,
  type OrderDoc,
  type OrderStage,
  type OrderType,
  type OrderUnitDoc,
  type PaymentDoc,
  type PaymentKind,
  type PaymentMethod,
  type PermissionKey,
  type ShopDoc,
  type StaffDoc,
  type StaffRole,
  type SaleDoc,
  type ExpenseDoc,
  type ExpenseCategory,
  type TenantFeatureDoc,
} from './schema'
import { hashPin } from '../lib/pin'
import { DEFAULT_CURRENCY } from '../lib/money'
import { paymentDateError, paymentError, toPaymentTimestamp } from '../lib/payments'
import { calculateBalance } from './balances'
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

/** Phase 7 (sections 31-32): shared by creation and the header editor. */
export interface OrderPartyInput {
  customer_type?: CustomerType
  organisation_name?: string
  purchase_order_reference?: string
  contact_person?: string
  expected_fulfilment_date?: string
}

export interface NewOrderInput extends OrderPartyInput {
  client_id: string
  order_type: OrderType
  item_description: string
  price_total_minor: number
  pickup_due_date: string
  return_due_date?: string
  notes?: string
  /** Rental only. Held and refundable, never part of price_total_minor -- see OrderDoc. */
  deposit_minor?: number
}

/** Shared by createOrder and updateOrderHeader -- every field here is optional. */
function partyFields(input: OrderPartyInput): Partial<OrderDoc> {
  return {
    ...(input.customer_type ? { customer_type: input.customer_type } : {}),
    ...(input.organisation_name?.trim() ? { organisation_name: input.organisation_name.trim() } : {}),
    ...(input.purchase_order_reference?.trim()
      ? { purchase_order_reference: input.purchase_order_reference.trim() }
      : {}),
    ...(input.contact_person?.trim() ? { contact_person: input.contact_person.trim() } : {}),
    ...(input.expected_fulfilment_date ? { expected_fulfilment_date: input.expected_fulfilment_date } : {}),
  }
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
    rental_deposit_minor: input.deposit_minor ?? 0,
    pickup_due_date: input.pickup_due_date,
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.return_due_date ? { return_due_date: input.return_due_date } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(staffId ? { created_by: staffId } : {}),
    ...partyFields(input),
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

export interface OrderHeaderInput extends OrderPartyInput {
  client_id: string
  order_type: OrderType
  pickup_due_date: string
  return_due_date?: string
  notes?: string
  /** Rental only. */
  deposit_minor?: number
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
    customer_type: input.customer_type,
    organisation_name: input.organisation_name?.trim() || undefined,
    purchase_order_reference: input.purchase_order_reference?.trim() || undefined,
    contact_person: input.contact_person?.trim() || undefined,
    expected_fulfilment_date: input.expected_fulfilment_date || undefined,
    rental_deposit_minor: input.order_type === 'rental' ? (input.deposit_minor ?? 0) : 0,
    updated_at: now(),
  })
}

/**
 * Marks a rental deposit as returned to the client. Never touches
 * price_total_minor or any balance -- a deposit is held, not earned (see
 * OrderDoc's own note), so refunding it is a fact about the deposit alone.
 */
export async function refundDeposit(db: AppDatabase, orderId: string): Promise<void> {
  const doc = await db.orders.findOne(orderId).exec()
  if (!doc) throw new Error('That order no longer exists on this device.')
  if (doc.rental_deposit_minor <= 0) throw new Error('This order has no deposit to refund.')
  if (doc.deposit_refunded_at) throw new Error('This deposit has already been refunded.')
  await doc.patch({ deposit_refunded_at: now() })
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
 *
 * The amount is checked against what the order already has on it, so instalments
 * cannot add up past the price and a settled order cannot take more money. The
 * forms check the same rule before submitting; this is the one that cannot be
 * bypassed.
 */
export async function recordPayment(
  db: AppDatabase,
  orderId: string,
  input: {
    amount_minor: number
    method: PaymentMethod
    notes?: string
    kind?: PaymentKind
    /** `YYYY-MM-DD`. Defaults to today; the past is allowed, the future is not. */
    payment_date?: string
  },
  staffId?: string,
): Promise<PaymentDoc> {
  const order = await db.orders.findOne(orderId).exec()
  if (!order) throw new Error('That order no longer exists on this device.')

  const existing = await db.payments.find({ selector: { order_id: orderId } }).exec()
  const balance = calculateBalance(order, existing.map((p) => p.toJSON()))
  const kind = input.kind ?? 'payment'

  const rejection =
    paymentError({
      priceTotalMinor: balance.price_total_minor,
      amountPaidMinor: balance.amount_paid_minor,
      amountMinor: input.amount_minor,
      kind,
      currency: order.currency,
    }) ?? (input.payment_date ? paymentDateError(input.payment_date) : null)
  if (rejection) throw new Error(rejection)

  const timestamp = now()
  const doc: PaymentDoc = {
    id: newId(),
    order_id: orderId,
    amount_minor: input.amount_minor,
    kind,
    payment_date: toPaymentTimestamp(input.payment_date, timestamp),
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
  input: { name: string; pin?: string; role: StaffRole },
): Promise<StaffDoc> {
  const timestamp = now()
  const doc: StaffDoc = {
    id: newId(),
    shop_id: shopId,
    name: input.name.trim(),
    ...(input.pin ? { pin_hash: await hashPin(input.pin) } : {}),
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
  await doc.patch({ pin_hash: await hashPin(pin), pin_updated_at: now() })
}

/** Removes the lock. The device then opens straight into the shop. */
export async function clearStaffPin(db: AppDatabase, staffId: string): Promise<void> {
  const doc = await db.staff.findOne(staffId).exec()
  if (!doc) throw new Error('That staff member no longer exists on this device.')
  await doc.patch({ pin_hash: undefined, pin_updated_at: now() })
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

/** Phase 12. Changing role never touches permission_overrides -- those stay
 * whatever they were, layered on top of whichever role is now active. */
export async function setStaffRole(db: AppDatabase, staffId: string, role: StaffRole): Promise<void> {
  const doc = await db.staff.findOne(staffId).exec()
  if (!doc) throw new Error('That staff member no longer exists on this device.')
  await doc.patch({ role, updated_at: now() })
}

/** Phase 12. Replaces the whole override set -- the caller sends the full picture, not a delta. */
export async function setStaffPermissionOverrides(
  db: AppDatabase,
  staffId: string,
  overrides: Partial<Record<PermissionKey, boolean>>,
): Promise<void> {
  const doc = await db.staff.findOne(staffId).exec()
  if (!doc) throw new Error('That staff member no longer exists on this device.')
  const hasAny = Object.keys(overrides).length > 0
  await doc.patch({
    permission_overrides: hasAny ? overrides : undefined,
    updated_at: now(),
  })
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
    business_type?: BusinessType
    logo_url?: string
    timezone?: string
    email?: string
    website?: string
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
    ...(input.business_type ? { business_type: input.business_type } : {}),
    logo_url: input.logo_url?.trim() || undefined,
    timezone: input.timezone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    website: input.website?.trim() || undefined,
  })
}

/**
 * Attaches a verified account to a shop that was set up without one.
 *
 * Refuses if the shop already belongs to a different account. Two shops on one
 * number is the unreconciled case in ARCHITECTURE D14, and quietly overwriting
 * the owner here would be how a device ends up syncing into someone else's shop.
 */
export async function claimShop(
  db: AppDatabase,
  shopId: string,
  supabaseAuthUserId: string,
): Promise<void> {
  const doc = await db.shops.findOne(shopId).exec()
  if (!doc) throw new Error('Shop record not found on this device.')

  const existing = doc.get('supabase_auth_user_id') as string | undefined
  if (existing && existing !== supabaseAuthUserId) {
    throw new Error('This shop is already backed up under a different number.')
  }

  await doc.patch({ supabase_auth_user_id: supabaseAuthUserId })
}

// -------------------------------------------------------- tenant features

/** Creates the override row on first toggle; patches it after that. */
export async function setFeatureEnabled(
  db: AppDatabase,
  shopId: string,
  featureKey: FeatureKey,
  enabled: boolean,
): Promise<void> {
  const existing = await db.tenant_features
    .findOne({ selector: { shop_id: shopId, feature_key: featureKey } })
    .exec()

  if (existing) {
    await existing.patch({ enabled, updated_at: now() })
    return
  }

  const timestamp = now()
  const doc: TenantFeatureDoc = {
    id: newId(),
    shop_id: shopId,
    feature_key: featureKey,
    enabled,
    created_at: timestamp,
    updated_at: timestamp,
  }
  await db.tenant_features.insert(doc)
}

// ------------------------------------------------------------------- sales

export interface NewSaleInput {
  item_description: string
  quantity: number
  unit_price_minor: number
  method: PaymentMethod
  /** Optional: a walk-in customer is not a client record. */
  client_id?: string
  reference?: string
  notes?: string
}

/** A sale is paid in full by definition; anything part-paid is an order. */
export async function recordSale(
  db: AppDatabase,
  shop: Pick<ShopDoc, 'id' | 'currency'>,
  input: NewSaleInput,
  staffId?: string,
): Promise<SaleDoc> {
  const timestamp = now()
  const doc: SaleDoc = {
    id: newId(),
    shop_id: shop.id,
    item_description: input.item_description.trim(),
    quantity: input.quantity,
    currency: shop.currency,
    unit_price_minor: input.unit_price_minor,
    method: input.method,
    sold_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.client_id ? { client_id: input.client_id } : {}),
    ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(staffId ? { recorded_by: staffId } : {}),
  }
  await db.sales.insert(doc)
  return doc
}

/** Soft-deleted with a trail: a void changes a profit figure already read. */
export async function voidSale(
  db: AppDatabase,
  saleId: string,
  reason?: string,
  staffId?: string,
): Promise<void> {
  const doc = await db.sales.findOne(saleId).exec()
  if (!doc) return

  const patched = await doc.patch({
    voided_at: now(),
    ...(staffId ? { voided_by: staffId } : {}),
    ...(reason?.trim() ? { void_reason: reason.trim() } : {}),
  })
  await patched.remove()
}

// ---------------------------------------------------------------- expenses

export interface NewExpenseInput {
  category: ExpenseCategory
  description: string
  amount_minor: number
  /** ISO date (YYYY-MM-DD). */
  spent_on: string
  notes?: string
}

export async function recordExpense(
  db: AppDatabase,
  shop: Pick<ShopDoc, 'id' | 'currency'>,
  input: NewExpenseInput,
  staffId?: string,
): Promise<ExpenseDoc> {
  const timestamp = now()
  const doc: ExpenseDoc = {
    id: newId(),
    shop_id: shop.id,
    category: input.category,
    description: input.description.trim(),
    currency: shop.currency,
    amount_minor: input.amount_minor,
    spent_on: input.spent_on,
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(staffId ? { recorded_by: staffId } : {}),
  }
  await db.expenses.insert(doc)
  return doc
}

export async function voidExpense(
  db: AppDatabase,
  expenseId: string,
  reason?: string,
  staffId?: string,
): Promise<void> {
  const doc = await db.expenses.findOne(expenseId).exec()
  if (!doc) return

  const patched = await doc.patch({
    voided_at: now(),
    ...(staffId ? { voided_by: staffId } : {}),
    ...(reason?.trim() ? { void_reason: reason.trim() } : {}),
  })
  await patched.remove()
}
