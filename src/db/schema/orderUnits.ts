
// ------------------------------------------------------------- order units

export const FABRIC_SOURCES = ['client', 'shop'] as const
export type FabricSource = (typeof FABRIC_SOURCES)[number]

export interface OrderUnitDoc {
  id: string
  order_id: string
  position: number
  /** Absent means "for the client themselves". Free text by design. */
  wearer_name?: string
  item_description: string
  price_minor: number
  /** Frozen snapshot keyed by measurement_fields.id, never rewritten by a profile edit. */
  measurements: Record<string, string | number>
  fabric_source: FabricSource
  done: boolean
  catalogue_item_id?: string // Phase 2, moved off orders
  photo_url?: string // Phase 2, reserved and unwritten
  notes?: string
  created_at: string
  updated_at: string
}
