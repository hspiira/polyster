import type { PolysterDatabase, Stored } from '../dexie/database'
import type { ExpenseCategory, ExpenseDoc, ShopDoc } from '../schema'
import { newId } from '../../lib/ids'
import { insertRow, now, observeBy, voidRow, type Observable } from './base'

export interface NewExpenseInput {
  category: ExpenseCategory
  description: string
  amount_minor: number
  /** ISO date (YYYY-MM-DD). */
  spent_on: string
  notes?: string
}

/** A shop's expenses, most recent first. */
export function observeExpenses(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<ExpenseDoc>[]> {
  return observeBy(db.expenses, 'shop_id', shopId, { key: 'spent_on', dir: 'desc' })
}

export async function recordExpense(
  db: PolysterDatabase,
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
  return insertRow(db.expenses, doc, shop.id, doc.description)
}

export async function voidExpense(
  db: PolysterDatabase,
  expenseId: string,
  reason?: string,
  staffId?: string,
): Promise<void> {
  await voidRow(db.expenses, expenseId, { reason, staffId })
}
