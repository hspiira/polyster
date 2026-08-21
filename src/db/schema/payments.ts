import type { OrderStage } from './orders'
// ---------------------------------------------------------------- payments

export const PAYMENT_METHODS = ['cash', 'mobile_money', 'bank', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_KINDS = ['payment', 'refund'] as const
export type PaymentKind = (typeof PAYMENT_KINDS)[number]

export interface PaymentDoc {
  id: string
  /** The order's shop, copied so payments can be read without joining orders. */
  shop_id: string
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
