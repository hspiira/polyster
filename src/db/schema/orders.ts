
export const ORDER_TYPES = ['tailor_made', 'rental', 'purchase', 'pre_order', 'repair'] as const
export type OrderType = (typeof ORDER_TYPES)[number]
export const ORDER_STAGES = [
  'measured',
  'in_progress',
  'ready',
  'picked_up',
  'returned',
  'cancelled',
  /** Repair-only -- see orderStage.ts's FLOWS. */
  'assessing',
  'approved',
  'repairing',
] as const
export type OrderStage = (typeof ORDER_STAGES)[number]

export const OPEN_STAGES: readonly OrderStage[] = ['measured', 'in_progress', 'ready']

/** Phase 7 (section 32): who the order is for, orthogonal to order_type. */
export const CUSTOMER_TYPES = ['individual', 'corporate'] as const
export type CustomerType = (typeof CUSTOMER_TYPES)[number]

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
