/* One physical garment, tracked through its life. */

export const GARMENT_UNIT_STATUSES = [
  'produced',
  'available',
  'reserved',
  'sold',
  'returned',
  'repair',
  'retired',
  'lost',
  'damaged',
] as const
export type GarmentUnitStatus = (typeof GARMENT_UNIT_STATUSES)[number]

export interface GarmentUnit {
  id: string
  shop_id: string
  product_variant_id: string
  production_batch_id: string | null
  serial_number: string
  status: GarmentUnitStatus
  customer_id: string | null
  sold_at: string | null
  /** Bearer of access to this unit's public passport page (section 34) -- never the id above. */
  public_token: string
  created_at: string
  updated_at: string
}
