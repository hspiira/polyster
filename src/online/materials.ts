/**
 * Materials. Online-only, see catalogue.ts's header comment for why.
 *
 * quantity_on_hand is a starting balance, set once at creation and never
 * updated after that (see updateMaterial) -- from Phase 4 onward, actual
 * stock changes go through the inventory ledger (src/online/inventory.ts),
 * matching the section 28 invariant that a quantity never changes without a
 * recorded movement. createMaterial seeds the ledger with that starting
 * balance so the two numbers start in agreement.
 */
import { getSupabase } from '../lib/supabaseClient'
import { friendlyError } from './friendlyError'
import { getOrCreateInventoryItem, recordMovement } from './inventory'

export type MaterialType = 'fabric' | 'thread' | 'button' | 'zipper' | 'label' | 'packaging' | 'other'
export const MATERIAL_TYPES: readonly MaterialType[] = [
  'fabric',
  'thread',
  'button',
  'zipper',
  'label',
  'packaging',
  'other',
]

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

function toRow(input: MaterialInput) {
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

export async function listMaterials(shopId: string): Promise<Material[]> {
  const { data, error } = await getSupabase()
    .from('materials')
    .select()
    .eq('shop_id', shopId)
    .order('name')
  if (error) throw friendlyError(error)
  return data
}

export async function createMaterial(shopId: string, input: MaterialInput): Promise<Material> {
  const { data, error } = await getSupabase()
    .from('materials')
    .insert({ shop_id: shopId, ...toRow(input), quantity_on_hand: input.quantity_on_hand })
    .select()
    .single()
  if (error) throw friendlyError(error)

  if (input.quantity_on_hand !== 0) {
    const item = await getOrCreateInventoryItem(shopId, 'material', { materialId: data.id }, input.unit)
    await recordMovement(shopId, item.id, {
      movement_type: 'adjustment',
      quantity: input.quantity_on_hand,
      reason: 'Starting quantity, set when the material was created',
    })
  }

  return data
}

/** Never touches quantity_on_hand -- stock changes go through the inventory ledger instead. */
export async function updateMaterial(id: string, input: MaterialInput): Promise<void> {
  const { error } = await getSupabase().from('materials').update(toRow(input)).eq('id', id)
  if (error) throw friendlyError(error)
}

export async function setMaterialActive(id: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().from('materials').update({ active }).eq('id', id)
  if (error) throw friendlyError(error)
}
