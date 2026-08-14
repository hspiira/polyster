import type { AppDatabase } from '../database'
import {
  type FabricSource,
  type CustomerType,
  type OrderDoc,
  type OrderStage,
  type OrderType,
} from '../schema'
import { DEFAULT_CURRENCY } from '../../lib/money'
import { needsReturn } from '../../lib/orderTypes'
import { generateOrderReference } from '../../lib/orderReference'
import { newId, now, loadOrThrow } from './shared'
import { recalculateOrder } from './orderUnits'

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
  /* Passed in, not patched on afterwards: create-then-patch pushes an UPDATE,
     and the plugin cannot build a conflict query for an object field. */
  wearer_name?: string
  fabric_source?: FabricSource
  measurements?: Record<string, string | number>
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

/* Every order carries at least one unit, at position 0. summary and
   price_total_minor are derived by recalculateOrder, not set here (invariant 1). */
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

  // The opening stage is part of the trail: without it, history starts at the
  // first change rather than at creation. Written first, per the header.
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
    measurements: input.measurements ?? {},
    fabric_source: input.fabric_source ?? 'shop',
    done: false,
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.wearer_name?.trim() ? { wearer_name: input.wearer_name.trim() } : {}),
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

/* The header save: client, type, dates and notes only, never a unit or a
   derived total. So it works whatever the unit count. */
export async function updateOrderHeader(
  db: AppDatabase,
  orderId: string,
  input: OrderHeaderInput,
): Promise<void> {
  const doc = await loadOrThrow(db, 'orders', orderId, 'order')

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
    rental_deposit_minor: needsReturn(input.order_type) ? (input.deposit_minor ?? 0) : 0,
    updated_at: now(),
  })
}

/* Marks a rental deposit returned. Never touches a balance: a deposit is held,
   not earned, so refunding it is a fact about the deposit alone. */
export async function refundDeposit(db: AppDatabase, orderId: string): Promise<void> {
  const doc = await loadOrThrow(db, 'orders', orderId, 'order')
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

/* Advances a stage and records who did it. History first, and everything else
   in one patch -- `extraPatch` spreads first, so it cannot override the stage. */
export async function changeOrderStage(
  db: AppDatabase,
  orderId: string,
  toStage: OrderStage,
  staffId?: string,
  extraPatch?: Partial<OrderDoc>,
): Promise<void> {
  const doc = await loadOrThrow(db, 'orders', orderId, 'order')

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

/* Routes through changeOrderStage, so history stays the one place logging the
   transition and the reason lands in the same patch. */
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

/* Order first, then units: a live order with zero live units looks exactly like
   one predating order_units, and the backfill would fabricate a unit for it. */
export async function archiveOrder(db: AppDatabase, orderId: string): Promise<void> {
  const doc = await db.orders.findOne(orderId).exec()
  await doc?.remove()

  const units = await db.order_units.find({ selector: { order_id: orderId } }).exec()
  await Promise.all(units.map((unit) => unit.remove()))
}
