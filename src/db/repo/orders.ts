import type { PolysterDatabase, Stored } from '../dexie/database'
import type {
  CustomerType,
  FabricSource,
  OrderDoc,
  OrderStage,
  OrderStageHistoryDoc,
  OrderType,
} from '../schema'
import { DEFAULT_CURRENCY } from '../../lib/money'
import { needsReturn } from '../../lib/orderTypes'
import { generateOrderReference } from '../../lib/orderReference'
import { newId } from '../../lib/ids'
import {
  insertRow,
  liveQuery,
  loadOrThrow,
  now,
  observeBy,
  observeRow,
  patchRow,
  softDeleteRow,
  sortRows,
  type Observable,
} from './base'
import { recalculateOrder } from './orderUnits'

/** Shared by creation and the header editor. */
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
  wearer_name?: string
  fabric_source?: FabricSource
  measurements?: Record<string, string | number>
}

// ------------------------------------------------------------------ reads

/** A shop's orders, soonest due first. */
export function observeOrders(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<OrderDoc>[]> {
  return observeBy(db.orders, 'shop_id', shopId, { key: 'pickup_due_date' })
}

export function observeOrder(
  db: PolysterDatabase,
  orderId: string,
): Observable<Stored<OrderDoc> | null> {
  return observeRow(db.orders, orderId)
}

/** One client's orders, most recently due first. */
export function observeClientOrders(
  db: PolysterDatabase,
  clientId: string,
): Observable<Stored<OrderDoc>[]> {
  return observeBy(db.orders, 'client_id', clientId, { key: 'pickup_due_date', dir: 'desc' })
}

/** The newest orders, for pulling defaults off recent work. */
export function observeRecentOrders(
  db: PolysterDatabase,
  shopId: string,
  limit: number,
): Observable<Stored<OrderDoc>[]> {
  return liveQuery(async () => {
    const rows = await db.orders.where('shop_id').equals(shopId).toArray()
    const live = rows.filter((row) => !row.deleted_at)
    return sortRows(live, { key: 'created_at', dir: 'desc' }).slice(0, limit)
  })
}

/** Whether the shop has recorded any order at all. */
export function observeHasOrders(db: PolysterDatabase): Observable<boolean> {
  return liveQuery(async () => {
    const rows = await db.orders.limit(50).toArray()
    return rows.some((row) => !row.deleted_at)
  })
}

/** How an order moved through its stages, most recent first. */
export function observeStageHistory(
  db: PolysterDatabase,
  orderId: string,
): Observable<Stored<OrderStageHistoryDoc>[]> {
  return observeBy(db.order_stage_history, 'order_id', orderId, {
    key: 'changed_at',
    dir: 'desc',
  })
}

// ----------------------------------------------------------------- writes

/** Shared by createOrder and updateOrderHeader -- every field here is optional. */
function partyFields(input: OrderPartyInput): Partial<OrderDoc> {
  return {
    ...(input.customer_type ? { customer_type: input.customer_type } : {}),
    ...(input.organisation_name?.trim()
      ? { organisation_name: input.organisation_name.trim() }
      : {}),
    ...(input.purchase_order_reference?.trim()
      ? { purchase_order_reference: input.purchase_order_reference.trim() }
      : {}),
    ...(input.contact_person?.trim() ? { contact_person: input.contact_person.trim() } : {}),
    ...(input.expected_fulfilment_date
      ? { expected_fulfilment_date: input.expected_fulfilment_date }
      : {}),
  }
}

/* Every order carries at least one unit, at position 0. summary and
   price_total_minor are derived by recalculateOrder, not set here (invariant 1). */
export async function createOrder(
  db: PolysterDatabase,
  shopId: string,
  input: NewOrderInput,
  staffId?: string,
): Promise<OrderDoc> {
  const timestamp = now()
  const shop = await db.shops.get(shopId)
  const description = input.item_description.trim()

  const doc: OrderDoc = {
    id: newId(),
    shop_id: shopId,
    client_id: input.client_id,
    order_type: input.order_type,
    reference: generateOrderReference(),
    currency: shop?.currency ?? DEFAULT_CURRENCY,
    // Placeholders only, to satisfy the required fields before the unit
    // exists -- recalculateOrder below overwrites both.
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

  await insertRow(db.orders, doc, shopId, doc.reference)

  // The opening stage is part of the trail: without it, history starts at the
  // first change rather than at creation.
  await insertRow(
    db.order_stage_history,
    {
      id: newId(),
      order_id: doc.id,
      to_stage: 'measured',
      changed_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
      ...(staffId ? { changed_by: staffId } : {}),
    },
    shopId,
  )

  await insertRow(
    db.order_units,
    {
      id: newId(),
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
    },
    shopId,
    description,
  )

  await recalculateOrder(db, doc.id)

  const saved = await db.orders.get(doc.id)
  if (!saved) throw new Error('Order was created but could not be reloaded.')
  return saved
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
  db: PolysterDatabase,
  orderId: string,
  input: OrderHeaderInput,
): Promise<void> {
  await patchRow(
    db.orders,
    orderId,
    {
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
    },
    { label: 'order' },
  )
}

/* Marks a rental deposit returned. Never touches a balance: a deposit is held,
   not earned, so refunding it is a fact about the deposit alone. */
export async function refundDeposit(db: PolysterDatabase, orderId: string): Promise<void> {
  const order = await loadOrThrow(db.orders, orderId, 'order')
  if (order.rental_deposit_minor <= 0) throw new Error('This order has no deposit to refund.')
  if (order.deposit_refunded_at) throw new Error('This deposit has already been refunded.')
  await patchRow(db.orders, orderId, { deposit_refunded_at: now(), updated_at: now() })
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
  db: PolysterDatabase,
  orderId: string,
  toStage: OrderStage,
  staffId?: string,
  extraPatch?: Partial<OrderDoc>,
): Promise<void> {
  const order = await loadOrThrow(db.orders, orderId, 'order')

  const fromStage = order.stage
  if (fromStage === toStage) return

  const timestamp = now()

  await insertRow(
    db.order_stage_history,
    {
      id: newId(),
      order_id: orderId,
      from_stage: fromStage,
      to_stage: toStage,
      changed_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
      ...(staffId ? { changed_by: staffId } : {}),
    },
    order.shop_id,
  )

  const timestampField = TERMINAL_STAGE_TIMESTAMP_FIELD[toStage]

  await patchRow(
    db.orders,
    orderId,
    {
      ...extraPatch,
      stage: toStage,
      updated_at: timestamp,
      ...(timestampField ? { [timestampField]: timestamp } : {}),
    },
    { summary: `${fromStage} to ${toStage}` },
  )
}

/* Routes through changeOrderStage, so history stays the one place logging the
   transition and the reason lands in the same patch. */
export async function cancelOrder(
  db: PolysterDatabase,
  orderId: string,
  reason: string,
  staffId?: string,
): Promise<void> {
  await changeOrderStage(db, orderId, 'cancelled', staffId, {
    cancellation_reason: reason.trim() || undefined,
  })
}

/** Soft-deletes an order and every item on it. */
export async function archiveOrder(db: PolysterDatabase, orderId: string): Promise<void> {
  const order = await db.orders.get(orderId)
  if (!order || order.deleted_at) return

  await softDeleteRow(db.orders, orderId, { summary: order.reference })

  const units = await db.order_units.where('order_id').equals(orderId).toArray()
  for (const unit of units) {
    await softDeleteRow(db.order_units, unit.id)
  }
}
