/* Fabric, thread and everything else consumed in making. */

export const MATERIAL_TYPES = [
  'fabric',
  'thread',
  'button',
  'zipper',
  'label',
  'packaging',
  'other',
] as const
export type MaterialType = (typeof MATERIAL_TYPES)[number]

export interface Material {
  id: string
  shop_id: string
  supplier_id: string | null
  name: string
  description: string | null
  material_type: MaterialType
  unit: string
  quantity_on_hand: number
  reorder_level: number
  unit_cost_minor: number
  currency: string
  composition: string | null
  gsm: number | null
  width: string | null
  colour: string | null
  pattern: string | null
  supplier_reference: string | null
  active: boolean
  created_at: string
  updated_at: string
}
