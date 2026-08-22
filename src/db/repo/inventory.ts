/* What is in stock, and every movement that changed it. A movement and the
   balance it moves are written together, so the ledger cannot disagree. */
import type { PolysterDatabase, Stored } from '../dexie/database'
import type { InventoryItem, InventoryMovement, ItemType, MovementType } from '../schema'
import { newId } from '../../lib/ids'
import {
  buildEvent,
  insertRow,
  listBy,
  loadOrThrow,
  now,
  observeBy,
  observeRow,
  prune,
  type Observable,
} from './base'

export function observeInventoryItems(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<InventoryItem>[]> {
  return observeBy(db.inventory_items, 'shop_id', shopId)
}

export function listInventoryItems(
  db: PolysterDatabase,
  shopId: string,
): Promise<Stored<InventoryItem>[]> {
  return listBy(db.inventory_items, 'shop_id', shopId)
}

export function observeInventoryItem(
  db: PolysterDatabase,
  id: string,
): Observable<Stored<InventoryItem> | null> {
  return observeRow(db.inventory_items, id)
}

function refColumn(itemType: ItemType): 'product_variant_id' | 'material_id' {
  return itemType === 'product_variant' ? 'product_variant_id' : 'material_id'
}

/** Read-only lookup -- unlike getOrCreateInventoryItem, never creates a row. */
export async function findInventoryItem(
  db: PolysterDatabase,
  shopId: string,
  itemType: ItemType,
  ref: { productVariantId?: string; materialId?: string },
): Promise<Stored<InventoryItem> | null> {
  const column = refColumn(itemType)
  const value = itemType === 'product_variant' ? ref.productVariantId : ref.materialId
  if (!value) return null
  const items = await listBy(db.inventory_items, 'shop_id', shopId)
  return items.find((item) => item[column] === value) ?? null
}

/** Finds the item for a variant or material, creating it at zero if absent. */
export async function getOrCreateInventoryItem(
  db: PolysterDatabase,
  shopId: string,
  itemType: ItemType,
  ref: { productVariantId?: string; materialId?: string },
  unit: string,
): Promise<Stored<InventoryItem>> {
  const column = refColumn(itemType)
  const value = itemType === 'product_variant' ? ref.productVariantId : ref.materialId
  if (!value) throw new Error(`${column} is required for item_type ${itemType}`)

  const existing = await findInventoryItem(db, shopId, itemType, ref)
  if (existing) return existing

  const timestamp = now()
  const row: InventoryItem = {
    id: newId(),
    shop_id: shopId,
    item_type: itemType,
    product_variant_id: null,
    material_id: null,
    [column]: value,
    quantity: 0,
    unit,
    created_at: timestamp,
    updated_at: timestamp,
  }
  return insertRow(db.inventory_items, row, shopId, unit)
}

export interface NewMovementInput {
  movement_type: MovementType
  quantity: number
  reference_type?: string
  reference_id?: string
  reason?: string
  notes?: string
}

/* Records a movement and applies it to the item's running total, as one
   transaction. Supabase did this with a trigger. */
export async function recordMovement(
  db: PolysterDatabase,
  shopId: string,
  inventoryItemId: string,
  input: NewMovementInput,
  staffId?: string,
): Promise<InventoryMovement> {
  if (input.quantity === 0) {
    throw new Error('A movement must change the quantity by a non-zero amount.')
  }
  if (input.movement_type === 'adjustment' && !input.reason?.trim()) {
    throw new Error('An adjustment needs a reason.')
  }

  const timestamp = now()
  const movement: InventoryMovement = {
    id: newId(),
    shop_id: shopId,
    inventory_item_id: inventoryItemId,
    movement_type: input.movement_type,
    quantity: input.quantity,
    reference_type: input.reference_type ?? null,
    reference_id: input.reference_id ?? null,
    reason: input.reason?.trim() || null,
    notes: input.notes?.trim() || null,
    created_by: staffId ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  }

  await db.transaction(
    'rw',
    [db.inventory_movements, db.inventory_items, db.events],
    async () => {
      const item = await loadOrThrow(db.inventory_items, inventoryItemId, 'stock item')

      await db.inventory_movements.add(movement)
      await db.inventory_items.put(
        prune({ ...item, quantity: item.quantity + input.quantity, updated_at: timestamp }),
      )
      await db.events.add(
        buildEvent({
          shop_id: shopId,
          entity: 'inventory_movements',
          entity_id: movement.id,
          action: 'created',
          after: movement as unknown as Record<string, unknown>,
          summary: `${input.movement_type} ${input.quantity}`,
        }),
      )
    },
  )

  return movement
}

/** One item's ledger, most recent first. */
export function observeMovements(
  db: PolysterDatabase,
  inventoryItemId: string,
): Observable<Stored<InventoryMovement>[]> {
  return observeBy(db.inventory_movements, 'inventory_item_id', inventoryItemId, {
    key: 'created_at',
    dir: 'desc',
  })
}

export function listMovements(
  db: PolysterDatabase,
  inventoryItemId: string,
): Promise<Stored<InventoryMovement>[]> {
  return listBy(db.inventory_movements, 'inventory_item_id', inventoryItemId, {
    key: 'created_at',
    dir: 'desc',
  })
}
