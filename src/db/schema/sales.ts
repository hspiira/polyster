import type { RxJsonSchema } from 'rxdb'
import { idField } from './shared'
import { PAYMENT_METHODS, type PaymentMethod } from './payments'

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
export const saleSchema: RxJsonSchema<SaleDoc> = {
  // v1: money moved to minor units and gained `currency`, plus the void trail.
  // v2: sold_at maxLength 30 -> 35. Migrations in database.ts.
  version: 2,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: idField,
    shop_id: idField,
    client_id: idField,
    item_description: { type: 'string' },
    quantity: { type: 'integer', minimum: 1 },
    currency: { type: 'string' },
    unit_price_minor: { type: 'integer', minimum: 0 },
    method: { type: 'string', enum: [...PAYMENT_METHODS] },
    reference: { type: 'string' },
    // 35, not 30: timestamptz with microseconds and a numeric offset is 32
    // characters, and a 30 cap took the whole replication down on pull.
    sold_at: { type: 'string', format: 'date-time', maxLength: 35 },
    recorded_by: idField,
    notes: { type: 'string' },
    voided_by: idField,
    voided_at: { type: 'string', format: 'date-time' },
    void_reason: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: [
    'id',
    'shop_id',
    'item_description',
    'quantity',
    'currency',
    'unit_price_minor',
    'method',
    'sold_at',
  ],
  // Compound: the report always asks for one shop's sales in a date window.
  indexes: [['shop_id', 'sold_at']],
}
