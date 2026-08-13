import type { RxJsonSchema } from 'rxdb'
import { uuidField } from './shared'

// ------------------------------------------------------------- order units

export type FabricSource = 'client' | 'shop'
export const FABRIC_SOURCES: readonly FabricSource[] = ['client', 'shop']

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
export const orderUnitSchema: RxJsonSchema<OrderUnitDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    order_id: uuidField,
    position: { type: 'number' },
    wearer_name: { type: 'string' },
    item_description: { type: 'string' },
    price_minor: { type: 'integer', minimum: 0 },
    measurements: { type: 'object', additionalProperties: true },
    fabric_source: { type: 'string', enum: [...FABRIC_SOURCES] },
    done: { type: 'boolean' },
    catalogue_item_id: uuidField,
    photo_url: { type: 'string' },
    notes: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: [
    'id',
    'order_id',
    'position',
    'item_description',
    'price_minor',
    'fabric_source',
    'done',
  ],
  indexes: ['order_id'],
}
