/* Inventory ledger, online-only. quantity is never written directly -- there is
   no UPDATE policy; recordMovement() inserts and a trigger applies it. */
import { getSupabase } from '../lib/supabaseClient'
import { friendlyError } from './friendlyError'

export type ItemType = 'product_variant' | 'material'

export type MovementType =
  | 'purchase'
  | 'production'
  | 'sale'
  | 'order_reservation'
  | 'order_fulfilment'
  | 'return'
  | 'damage'
  | 'loss'
  | 'adjustment'
  | 'sample'
  | 'repair'

export const MOVEMENT_TYPES: readonly MovementType[] = [
  'purchase',
  'production',
  'sale',
  'order_reservation',
  'order_fulfilment',
  'return',
  'damage',
  'loss',
  'adjustment',
  'sample',
  'repair',
]

export interface InventoryItem {
  id: string
  shop_id: string
  item_type: ItemType
  product_variant_id: string | null
  material_id: string | null
  quantity: number
  unit: string
  created_at: string
  updated_at: string
}

export interface InventoryMovement {
  id: string
  shop_id: string
  inventory_item_id: string
  movement_type: MovementType
  quantity: number
  reference_type: string | null
  reference_id: string | null
  reason: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export async function listInventoryItems(shopId: string): Promise<InventoryItem[]> {
  const { data, error } = await getSupabase().from('inventory_items').select().eq('shop_id', shopId)
  if (error) throw friendlyError(error)
  return data
}

/** Read-only lookup -- unlike getOrCreateInventoryItem, never creates a row. */
export async function findInventoryItem(
  itemType: ItemType,
  ref: { productVariantId?: string; materialId?: string },
): Promise<InventoryItem | null> {
  const column = itemType === 'product_variant' ? 'product_variant_id' : 'material_id'
  const value = itemType === 'product_variant' ? ref.productVariantId : ref.materialId
  if (!value) return null
  const { data, error } = await getSupabase().from('inventory_items').select().eq(column, value).maybeSingle()
  if (error) throw friendlyError(error)
  return data
}

/** Finds the item for a variant/material, creating it at quantity 0 if it doesn't exist yet. */
export async function getOrCreateInventoryItem(
  shopId: string,
  itemType: ItemType,
  ref: { productVariantId?: string; materialId?: string },
  unit: string,
): Promise<InventoryItem> {
  const column = itemType === 'product_variant' ? 'product_variant_id' : 'material_id'
  const value = itemType === 'product_variant' ? ref.productVariantId : ref.materialId
  if (!value) throw new Error(`${column} is required for item_type ${itemType}`)

  const { data: existing, error: findErr } = await getSupabase()
    .from('inventory_items')
    .select()
    .eq(column, value)
    .maybeSingle()
  if (findErr) throw friendlyError(findErr)
  if (existing) return existing

  const { data: created, error: createErr } = await getSupabase()
    .from('inventory_items')
    .insert({ shop_id: shopId, item_type: itemType, [column]: value, unit, quantity: 0 })
    .select()
    .single()
  if (createErr) throw friendlyError(createErr)
  return created
}

export interface NewMovementInput {
  movement_type: MovementType
  quantity: number
  reference_type?: string
  reference_id?: string
  reason?: string
  notes?: string
}

/** Inserts a movement. The database trigger applies it to the item's running total. */
export async function recordMovement(
  shopId: string,
  inventoryItemId: string,
  input: NewMovementInput,
  staffId?: string,
): Promise<InventoryMovement> {
  if (input.quantity === 0) throw new Error('A movement must change the quantity by a non-zero amount.')
  if (input.movement_type === 'adjustment' && !input.reason?.trim()) {
    throw new Error('An adjustment needs a reason.')
  }

  const { data, error } = await getSupabase()
    .from('inventory_movements')
    .insert({
      shop_id: shopId,
      inventory_item_id: inventoryItemId,
      movement_type: input.movement_type,
      quantity: input.quantity,
      reference_type: input.reference_type ?? null,
      reference_id: input.reference_id ?? null,
      reason: input.reason?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: staffId ?? null,
    })
    .select()
    .single()
  if (error) throw friendlyError(error)
  return data
}

export async function listMovements(inventoryItemId: string): Promise<InventoryMovement[]> {
  const { data, error } = await getSupabase()
    .from('inventory_movements')
    .select()
    .eq('inventory_item_id', inventoryItemId)
    .order('created_at', { ascending: false })
  if (error) throw friendlyError(error)
  return data
}
