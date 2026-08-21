
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
