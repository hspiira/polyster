import type { AppDatabase } from '../database'
import {
  type ShopDoc,
  type ExpenseDoc,
  type ExpenseCategory,
} from '../schema'
import { newId, now } from './shared'

// ---------------------------------------------------------------- expenses

export interface NewExpenseInput {
  category: ExpenseCategory
  description: string
  amount_minor: number
  /** ISO date (YYYY-MM-DD). */
  spent_on: string
  notes?: string
}

export async function recordExpense(
  db: AppDatabase,
  shop: Pick<ShopDoc, 'id' | 'currency'>,
  input: NewExpenseInput,
  staffId?: string,
): Promise<ExpenseDoc> {
  const timestamp = now()
  const doc: ExpenseDoc = {
    id: newId(),
    shop_id: shop.id,
    category: input.category,
    description: input.description.trim(),
    currency: shop.currency,
    amount_minor: input.amount_minor,
    spent_on: input.spent_on,
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(staffId ? { recorded_by: staffId } : {}),
  }
  await db.expenses.insert(doc)
  return doc
}

export async function voidExpense(
  db: AppDatabase,
  expenseId: string,
  reason?: string,
  staffId?: string,
): Promise<void> {
  const doc = await db.expenses.findOne(expenseId).exec()
  if (!doc) return

  const patched = await doc.patch({
    voided_at: now(),
    ...(staffId ? { voided_by: staffId } : {}),
    ...(reason?.trim() ? { void_reason: reason.trim() } : {}),
  })
  await patched.remove()
}
