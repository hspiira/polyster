/* Garment identity (§29), online-only. Generic: any tenant may track
   individual garments. */
import { getSupabase } from '../lib/supabaseClient'
export { GARMENT_UNIT_STATUSES } from '../db/schema'
export type { GarmentUnitStatus, GarmentUnit } from '../db/schema'
import type { GarmentUnitStatus, GarmentUnit } from '../db/schema'
import { friendlyError } from './friendlyError'

export interface GarmentUnitInput {
  product_variant_id: string
  production_batch_id?: string
  serial_number: string
  status: GarmentUnitStatus
  customer_id?: string
  sold_at?: string
}

function toRow(input: GarmentUnitInput) {
  return {
    product_variant_id: input.product_variant_id,
    production_batch_id: input.production_batch_id || null,
    serial_number: input.serial_number.trim(),
    status: input.status,
    customer_id: input.customer_id || null,
    sold_at: input.status === 'sold' ? (input.sold_at ?? null) : null,
  }
}

export async function listGarmentUnits(shopId: string): Promise<GarmentUnit[]> {
  const { data, error } = await getSupabase()
    .from('garment_units')
    .select()
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
  if (error) throw friendlyError(error)
  return data
}

export async function createGarmentUnit(shopId: string, input: GarmentUnitInput): Promise<GarmentUnit> {
  const { data, error } = await getSupabase()
    .from('garment_units')
    .insert({ shop_id: shopId, ...toRow(input) })
    .select()
    .single()
  if (error) throw friendlyError(error)
  return data
}

export async function updateGarmentUnit(id: string, input: GarmentUnitInput): Promise<void> {
  const { error } = await getSupabase().from('garment_units').update(toRow(input)).eq('id', id)
  if (error) throw friendlyError(error)
}
