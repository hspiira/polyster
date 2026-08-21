import type { RxJsonSchema } from 'rxdb'
import { idField } from './shared'
import { ORDER_STAGES, type OrderStage } from './orders'

// ---------------------------------------------------------------- payments

export const PAYMENT_METHODS = ['cash', 'mobile_money', 'bank', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_KINDS = ['payment', 'refund'] as const
export type PaymentKind = (typeof PAYMENT_KINDS)[number]

export interface PaymentDoc {
  id: string
  order_id: string
  amount_minor: number
  /** A refund is a positive row with kind 'refund', never a negative payment. */
  kind: PaymentKind
  /** When the money moved. */
  payment_date: string
  method: PaymentMethod
  /** Mobile-money transaction id, for statement reconciliation. */
  reference?: string
  recorded_by?: string
  notes?: string
  voided_by?: string
  voided_at?: string
  void_reason?: string
  /** When it was typed in, which offline is not when it moved. */
  created_at: string
}
export const paymentSchema: RxJsonSchema<PaymentDoc> = {
  version: 1, // v1: amount in minor units, kind, created_at, reference, void trail
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: idField,
    order_id: idField,
    // Positive only, for both kinds. A mistaken payment is voided via
    // soft-delete, not by entering a negative correcting row.
    amount_minor: { type: 'integer', exclusiveMinimum: 0 },
    kind: { type: 'string', enum: [...PAYMENT_KINDS] },
    payment_date: { type: 'string', format: 'date-time' },
    method: { type: 'string', enum: [...PAYMENT_METHODS] },
    reference: { type: 'string' },
    recorded_by: idField,
    notes: { type: 'string' },
    voided_by: idField,
    voided_at: { type: 'string', format: 'date-time' },
    void_reason: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'order_id', 'amount_minor', 'kind', 'payment_date', 'method'],
  indexes: ['order_id'],
}

export interface OrderStageHistoryDoc {
  id: string
  order_id: string
  from_stage?: OrderStage
  to_stage: OrderStage
  /** "Client asked us to hold it." */
  note?: string
  changed_by?: string
  changed_at: string
}
export const orderStageHistorySchema: RxJsonSchema<OrderStageHistoryDoc> = {
  version: 2, // v1: note. v2: from_stage/to_stage gain repair stages (Phase 9).
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: idField,
    order_id: idField,
    from_stage: { type: 'string', enum: [...ORDER_STAGES] },
    to_stage: { type: 'string', enum: [...ORDER_STAGES] },
    note: { type: 'string' },
    changed_by: idField,
    changed_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'order_id', 'to_stage', 'changed_at'],
  indexes: ['order_id'],
}
