/* What is in stock, and every movement that changed it. */

export type ItemType = 'product_variant' | 'material'

export const MOVEMENT_TYPES = [
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
] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

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
