import type { RxJsonSchema } from 'rxdb'
import { uuidField } from './shared'

export type OrderType = 'tailor_made' | 'rental' | 'purchase' | 'pre_order' | 'repair'
export type OrderStage =
  | 'measured'
  | 'in_progress'
  | 'ready'
  | 'picked_up'
  | 'returned'
  | 'cancelled'
  /** Phase 9 (section 33), repair-only -- see orderStage.ts's FLOWS. */
  | 'assessing'
  | 'approved'
  | 'repairing'

export const ORDER_TYPES: readonly OrderType[] = [
  'tailor_made',
  'rental',
  'purchase',
  'pre_order',
  'repair',
]
export const ORDER_STAGES: readonly OrderStage[] = [
  'measured',
  'in_progress',
  'ready',
  'picked_up',
  'returned',
  'cancelled',
  'assessing',
  'approved',
  'repairing',
]

export const OPEN_STAGES: readonly OrderStage[] = ['measured', 'in_progress', 'ready']

/** Phase 7 (section 32): who the order is for, orthogonal to order_type. */
export type CustomerType = 'individual' | 'corporate'
export const CUSTOMER_TYPES: readonly CustomerType[] = ['individual', 'corporate']

export interface OrderDoc {
  id: string
  shop_id: string
  client_id: string
  order_type: OrderType
  reference: string
  currency: string
  summary: string
  stage: OrderStage
  price_total_minor: number
  price_adjustment_minor: number
  adjustment_reason?: string
  rental_deposit_minor: number
  deposit_refunded_at?: string
  pickup_due_date: string
  return_due_date?: string
  picked_up_at?: string
  returned_at?: string
  cancelled_at?: string
  cancellation_reason?: string
  notes?: string
  customer_type?: CustomerType
  organisation_name?: string
  purchase_order_reference?: string
  contact_person?: string
  expected_fulfilment_date?: string
  product_variant_id?: string
  collection_id?: string
  production_batch_id?: string
  garment_unit_id?: string
  created_by?: string
  created_at: string
  updated_at: string
}
export const orderSchema: RxJsonSchema<OrderDoc> = {
  version: 3, // v3: order_type/stage gain 'repair' values, garment_unit_id (Phase 9)
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    client_id: uuidField,
    order_type: { type: 'string', enum: [...ORDER_TYPES] },
    reference: { type: 'string' },
    currency: { type: 'string' },
    summary: { type: 'string' },
    stage: { type: 'string', enum: [...ORDER_STAGES], maxLength: 20 },
    price_total_minor: { type: 'integer', minimum: 0 },
    price_adjustment_minor: { type: 'integer' },
    adjustment_reason: { type: 'string' },
    rental_deposit_minor: { type: 'integer', minimum: 0 },
    deposit_refunded_at: { type: 'string', format: 'date-time' },
    pickup_due_date: { type: 'string', format: 'date', maxLength: 10 },
    return_due_date: { type: 'string', format: 'date' },
    picked_up_at: { type: 'string', format: 'date-time' },
    returned_at: { type: 'string', format: 'date-time' },
    cancelled_at: { type: 'string', format: 'date-time' },
    cancellation_reason: { type: 'string' },
    notes: { type: 'string' },
    customer_type: { type: 'string', enum: [...CUSTOMER_TYPES] },
    organisation_name: { type: 'string' },
    purchase_order_reference: { type: 'string' },
    contact_person: { type: 'string' },
    expected_fulfilment_date: { type: 'string', format: 'date' },
    product_variant_id: uuidField,
    collection_id: uuidField,
    production_batch_id: uuidField,
    garment_unit_id: uuidField,
    created_by: uuidField,
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: [
    'id',
    'shop_id',
    'client_id',
    'order_type',
    'reference',
    'currency',
    'summary',
    'stage',
    'price_total_minor',
    'price_adjustment_minor',
    'rental_deposit_minor',
    'pickup_due_date',
  ],
  indexes: [
    ['shop_id', 'pickup_due_date'],
    ['shop_id', 'stage'],
    'client_id',
  ],
}
