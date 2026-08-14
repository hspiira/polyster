import type { AppDatabase } from '../database'
import {
  type FabricSource,
  type OrderUnitDoc,
} from '../schema'
import { newId, now, loadOrThrow } from './shared'

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

/* Rebuilds an order's caches. The only thing permitted to set
   price_total_minor or summary (invariant 1). */
export async function recalculateOrder(db: AppDatabase, orderId: string): Promise<void> {
  const order = await loadOrThrow(db, 'orders', orderId, 'order')

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
  const unit = await loadOrThrow(db, 'order_units', unitId, 'item')

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
  const unit = await loadOrThrow(db, 'order_units', unitId, 'item')

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
  const unit = await loadOrThrow(db, 'order_units', unitId, 'item')

  await unit.patch({ done, updated_at: now() })
  await recalculateOrder(db, unit.order_id)
}

/* Sets the adjustment. Checked here, not in recalculateOrder: patching first
   and throwing after would leave invariant 1 broken on disk. */
export async function setOrderAdjustment(
  db: AppDatabase,
  orderId: string,
  minor: number,
  reason?: string,
): Promise<void> {
  const order = await loadOrThrow(db, 'orders', orderId, 'order')

  const units = await db.order_units.find({ selector: { order_id: orderId } }).exec()
  const subtotal = units.reduce((sum, unit) => sum + unit.price_minor, 0)

  if (subtotal + minor < 0) throw new Error('That discount is larger than the order total.')

  await order.patch({ price_adjustment_minor: minor, adjustment_reason: reason || undefined })
  await recalculateOrder(db, orderId)
}
