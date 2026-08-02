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
  type MeasurementFieldDoc,
  type MeasurementFieldType,
  type OrderDoc,
  type OrderStage,
  type OrderType,
  type PaymentDoc,
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

export async function removeMeasurementField(db: AppDatabase, fieldId: string): Promise<void> {
  // Soft-deleted, not purged. Existing measurement_profiles still hold values
  // keyed by this id, and a client's recorded chest measurement should not
  // vanish because the shop tidied its field list.
  const doc = await db.measurement_fields.findOne(fieldId).exec()
  await doc?.remove()
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
 * this form creates) gets exactly one, at position 0, mirroring the order's
 * own description and price.
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

  // The opening stage is part of the trail too. Without it, an order's history
  // starts at its first change rather than at its creation.
  await db.order_stage_history.insert({
    id: newId(),
    order_id: doc.id,
    to_stage: 'measured',
    changed_at: timestamp,
    ...(staffId ? { changed_by: staffId } : {}),
  })

  return doc
}

/** Patches the order's own fields. Its unit row is untouched -- syncing the two is later work. */
export async function updateOrder(
  db: AppDatabase,
  orderId: string,
  input: NewOrderInput,
): Promise<void> {
  const doc = await db.orders.findOne(orderId).exec()
  if (!doc) throw new Error('That order no longer exists on this device.')

  await doc.patch({
    client_id: input.client_id,
    order_type: input.order_type,
    summary: input.item_description.trim(),
    price_total_minor: input.price_total_minor,
    pickup_due_date: input.pickup_due_date,
    return_due_date: input.return_due_date || undefined,
    notes: input.notes?.trim() || undefined,
    updated_at: now(),
  })
}

/**
 * Advances an order to a new stage and records who did it.
 *
 * History first -- see the transaction note at the top of this file.
 */
export async function changeOrderStage(
  db: AppDatabase,
  orderId: string,
  toStage: OrderStage,
  staffId?: string,
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

  await doc.patch({ stage: toStage, updated_at: timestamp })
}

export async function archiveOrder(db: AppDatabase, orderId: string): Promise<void> {
  const doc = await db.orders.findOne(orderId).exec()
  await doc?.remove()
}

// --------------------------------------------------------------- payments

export async function recordPayment(
  db: AppDatabase,
  orderId: string,
  input: { amount_minor: number; method: PaymentMethod; notes?: string },
  staffId?: string,
): Promise<PaymentDoc> {
  const timestamp = now()
  const doc: PaymentDoc = {
    id: newId(),
    order_id: orderId,
    amount_minor: input.amount_minor,
    kind: 'payment',
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
 */
export async function voidPayment(db: AppDatabase, paymentId: string): Promise<void> {
  const doc = await db.payments.findOne(paymentId).exec()
  await doc?.remove()
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
  input: { name: string; whatsapp_number?: string },
): Promise<void> {
  const doc = await db.shops.findOne(shopId).exec()
  if (!doc) throw new Error('Shop record not found on this device.')

  await doc.patch({
    name: input.name.trim(),
    whatsapp_number: input.whatsapp_number?.trim() || undefined,
  })
}
