import type { RxJsonSchema } from 'rxdb'
import { idField } from './shared'

// ---------------------------------------------------------------- expenses

export const EXPENSE_CATEGORIES = [
  'materials',
  'rent',
  'wages',
  'transport',
  'utilities',
  'other',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

/** Money out. Without it there is no profit, only revenue. */
export interface ExpenseDoc {
  id: string
  shop_id: string
  category: ExpenseCategory
  description: string
  currency: string
  amount_minor: number
  /** ISO date (YYYY-MM-DD). An expense belongs to a day in the books. */
  spent_on: string
  recorded_by?: string
  notes?: string
  voided_by?: string
  voided_at?: string
  void_reason?: string
  created_at: string
  updated_at: string
}
export const expenseSchema: RxJsonSchema<ExpenseDoc> = {
  // v1: as with sales -- `amount` in major units became `amount_minor`, plus
  // `currency` and the void trail.
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: idField,
    shop_id: idField,
    category: { type: 'string', enum: [...EXPENSE_CATEGORIES] },
    description: { type: 'string' },
    currency: { type: 'string' },
    amount_minor: { type: 'integer', exclusiveMinimum: 0 },
    spent_on: { type: 'string', format: 'date', maxLength: 10 },
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
    'category',
    'description',
    'currency',
    'amount_minor',
    'spent_on',
  ],
  indexes: [['shop_id', 'spent_on']],
}
