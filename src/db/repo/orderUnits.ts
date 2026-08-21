import type { PolysterDatabase, Stored } from '../dexie/database'
import type { FabricSource, OrderUnitDoc } from '../schema'
import { newId } from '../../lib/ids'
import {
  insertRow,
  listBy,
  loadOrThrow,
  now,
  observeBy,
  patchRow,
  softDeleteRow,
  type Observable,
} from './base'

/** Fields a caller supplies for a unit; `position` and `done` are managed here. */
export interface OrderUnitInput {
  wearer_name?: string
  item_description: string
  price_minor: number
  measurements?: OrderUnitDoc['measurements']
  fabric_source?: FabricSource
  notes?: string
}

/** The items on an order, in the order they are shown. */
export function observeOrderUnits(
  db: PolysterDatabase,
  orderId: string,
): Observable<Stored<OrderUnitDoc>[]> {
  return observeBy(db.order_units, 'order_id', orderId, { key: 'position' })
}

/** Invariant 3: first description up to its comma, plus a count of the rest. */
export function buildSummary(descriptions: readonly string[]): string {
  const [first, ...rest] = descriptions
  if (!first) return ''
  const head = first.split(',')[0]!.trim()
  return rest.length > 0 ? `${head} +${rest.length}` : head
}

function unitsOf(db: PolysterDatabase, orderId: string): Promise<Stored<OrderUnitDoc>[]> {
  return listBy(db.order_units, 'order_id', orderId, { key: 'position' })
}

/* Rebuilds an order's caches. The only thing permitted to set
   price_total_minor or summary (invariant 1). */
export async function recalculateOrder(db: PolysterDatabase, orderId: string): Promise<void> {
  const order = await loadOrThrow(db.orders, orderId, 'order')
  const units = await unitsOf(db, orderId)

  const subtotal = units.reduce((sum, unit) => sum + unit.price_minor, 0)
  const total = subtotal + order.price_adjustment_minor

  // Backstop for paths that change unit prices under an existing adjustment;
  // setOrderAdjustment itself checks before it patches.
  if (total < 0) throw new Error('That discount is larger than the order total.')

  await patchRow(db.orders, orderId, {
    price_total_minor: total,
    summary: buildSummary(units.map((unit) => unit.item_description)),
    updated_at: now(),
  })
}

export async function addOrderUnit(
  db: PolysterDatabase,
  orderId: string,
  input: OrderUnitInput,
): Promise<OrderUnitDoc> {
  const order = await loadOrThrow(db.orders, orderId, 'order')
  const timestamp = now()

  const doc: OrderUnitDoc = {
    id: newId(),
    order_id: orderId,
    position: (await unitsOf(db, orderId)).length,
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

  await insertRow(db.order_units, doc, order.shop_id, doc.item_description)
  await recalculateOrder(db, orderId)
  return doc
}

export async function updateOrderUnit(
  db: PolysterDatabase,
  unitId: string,
  input: Partial<OrderUnitInput>,
): Promise<void> {
  const unit = await loadOrThrow(db.order_units, unitId, 'item')

  await patchRow(db.order_units, unitId, {
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
export async function removeOrderUnit(db: PolysterDatabase, unitId: string): Promise<void> {
  const unit = await loadOrThrow(db.order_units, unitId, 'item')

  const units = await unitsOf(db, unit.order_id)
  if (units.length <= 1) throw new Error('An order needs at least one item.')

  await softDeleteRow(db.order_units, unitId, { summary: unit.item_description })
  await recalculateOrder(db, unit.order_id)
}

export async function reorderOrderUnits(
  db: PolysterDatabase,
  orderId: string,
  orderedIds: readonly string[],
): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    if (await db.order_units.get(id)) {
      await patchRow(db.order_units, id, { position: index, updated_at: now() })
    }
  }
  await recalculateOrder(db, orderId)
}

export async function setUnitDone(
  db: PolysterDatabase,
  unitId: string,
  done: boolean,
): Promise<void> {
  const unit = await loadOrThrow(db.order_units, unitId, 'item')
  await patchRow(db.order_units, unitId, { done, updated_at: now() })
  await recalculateOrder(db, unit.order_id)
}

/* Sets the adjustment. Checked here, not in recalculateOrder: patching first
   and throwing after would leave invariant 1 broken on disk. */
export async function setOrderAdjustment(
  db: PolysterDatabase,
  orderId: string,
  minor: number,
  reason?: string,
): Promise<void> {
  await loadOrThrow(db.orders, orderId, 'order')

  const units = await unitsOf(db, orderId)
  const subtotal = units.reduce((sum, unit) => sum + unit.price_minor, 0)
  if (subtotal + minor < 0) throw new Error('That discount is larger than the order total.')

  await patchRow(db.orders, orderId, {
    price_adjustment_minor: minor,
    adjustment_reason: reason || undefined,
  })
  await recalculateOrder(db, orderId)
}
