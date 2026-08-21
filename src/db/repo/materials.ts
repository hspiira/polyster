/* Fabric, thread and everything else consumed in making. quantity_on_hand is a
   starting balance set once: real changes go through the inventory ledger. */
import type { PolysterDatabase, Stored } from '../dexie/database'
import type { Material, MaterialType } from '../schema'
import { DEFAULT_CURRENCY } from '../../lib/money'
import { newId } from '../../lib/ids'
import { insertRow, listBy, now, observeBy, patchRow, type Observable } from './base'
import { getOrCreateInventoryItem, recordMovement } from './inventory'

export interface MaterialInput {
  name: string
  description?: string
  material_type: MaterialType
  unit: string
  quantity_on_hand: number
  reorder_level: number
  unit_cost_minor: number
  supplier_id?: string
  composition?: string
  gsm?: number
  width?: string
  colour?: string
  pattern?: string
  supplier_reference?: string
}

export function observeMaterials(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<Material>[]> {
  return observeBy(db.materials, 'shop_id', shopId, { key: 'name' })
}

export function listMaterials(db: PolysterDatabase, shopId: string): Promise<Stored<Material>[]> {
  return listBy(db.materials, 'shop_id', shopId, { key: 'name' })
}

function fields(input: MaterialInput) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    material_type: input.material_type,
    unit: input.unit.trim() || 'unit',
    reorder_level: input.reorder_level,
    unit_cost_minor: input.unit_cost_minor,
    supplier_id: input.supplier_id || null,
    composition: input.composition?.trim() || null,
    gsm: input.gsm ?? null,
    width: input.width?.trim() || null,
    colour: input.colour?.trim() || null,
    pattern: input.pattern?.trim() || null,
    supplier_reference: input.supplier_reference?.trim() || null,
  }
}

export async function createMaterial(
  db: PolysterDatabase,
  shopId: string,
  input: MaterialInput,
): Promise<Material> {
  const timestamp = now()
  const shop = await db.shops.get(shopId)
  const row: Material = {
    id: newId(),
    shop_id: shopId,
    ...fields(input),
    quantity_on_hand: input.quantity_on_hand,
    currency: shop?.currency ?? DEFAULT_CURRENCY,
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
  }
  await insertRow(db.materials, row, shopId, row.name)

  if (input.quantity_on_hand !== 0) {
    const item = await getOrCreateInventoryItem(
      db,
      shopId,
      'material',
      { materialId: row.id },
      row.unit,
    )
    await recordMovement(db, shopId, item.id, {
      movement_type: 'adjustment',
      quantity: input.quantity_on_hand,
      reason: 'Starting quantity, set when the material was created',
    })
  }

  return row
}

/** Never touches quantity_on_hand -- stock changes go through the ledger. */
export async function updateMaterial(
  db: PolysterDatabase,
  id: string,
  input: MaterialInput,
): Promise<void> {
  await patchRow(db.materials, id, { ...fields(input), updated_at: now() }, { label: 'material' })
}

export async function setMaterialActive(
  db: PolysterDatabase,
  id: string,
  active: boolean,
): Promise<void> {
  await patchRow(db.materials, id, { active, updated_at: now() }, { label: 'material' })
}
