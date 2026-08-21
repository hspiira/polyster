import type { PaymentMethod } from './payments'
// ------------------------------------------------------------------- sales

/** Money taken over the counter. Smaller than an order: no due date, no
 * stages, no balance, and the client is optional. */
export interface SaleDoc {
  id: string
  shop_id: string
  /** Optional. A walk-in customer is not a client record. */
  client_id?: string
  item_description: string
  quantity: number
  /** Denormalised, like orders: a currency change must not rewrite history. */
  currency: string
  /** Price for one unit. Line total is quantity * unit_price_minor. */
  unit_price_minor: number
  method: PaymentMethod
  reference?: string
  /** When the money moved, which offline is not when it was typed in. */
  sold_at: string
  recorded_by?: string
  notes?: string
  voided_by?: string
  voided_at?: string
  void_reason?: string
  created_at: string
  updated_at: string
}
