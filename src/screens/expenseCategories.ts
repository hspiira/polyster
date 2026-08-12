import type { ExpenseCategory } from '../db/schema'

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  materials: 'Materials',
  rent: 'Rent',
  wages: 'Wages',
  transport: 'Transport',
  utilities: 'Utilities',
  other: 'Other',
}
