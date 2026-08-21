/* A run of making, and what it cost. */

export const BATCH_STATUSES = [
  'planned',
  'materials_ready',
  'in_production',
  'quality_control',
  'completed',
  'cancelled',
] as const
export type BatchStatus = (typeof BATCH_STATUSES)[number]

export const COST_TYPES = [
  'materials',
  'labour',
  'transport',
  'packaging',
  'labels',
  'quality_control',
  'other',
] as const
export type CostType = (typeof COST_TYPES)[number]

export interface ProductionBatch {
  id: string
  shop_id: string
  product_id: string
  batch_number: string
  planned_quantity: number
  produced_quantity: number
  accepted_quantity: number
  rejected_quantity: number
  status: BatchStatus
  started_at: string | null
  completed_at: string | null
  notes: string | null
  rejected_reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ProductionBatchCost {
  id: string
  shop_id: string
  batch_id: string
  cost_type: CostType
  description: string | null
  amount_minor: number
  currency: string
  created_at: string
}
