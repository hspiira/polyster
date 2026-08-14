import type { AppDatabase } from '../database'
import {
  type PaymentMethod,
  type ShopDoc,
  type SaleDoc,
} from '../schema'
import { newId, now } from './shared'

// ------------------------------------------------------------------- sales

export interface NewSaleInput {
  item_description: string
  quantity: number
  unit_price_minor: number
  method: PaymentMethod
  /** Optional: a walk-in customer is not a client record. */
  client_id?: string
  reference?: string
  notes?: string
}

/** A sale is paid in full by definition; anything part-paid is an order. */
export async function recordSale(
  db: AppDatabase,
  shop: Pick<ShopDoc, 'id' | 'currency'>,
  input: NewSaleInput,
  staffId?: string,
): Promise<SaleDoc> {
  const timestamp = now()
  const doc: SaleDoc = {
    id: newId(),
    shop_id: shop.id,
    item_description: input.item_description.trim(),
    quantity: input.quantity,
    currency: shop.currency,
    unit_price_minor: input.unit_price_minor,
    method: input.method,
    sold_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.client_id ? { client_id: input.client_id } : {}),
    ...(input.reference?.trim() ? { reference: input.reference.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(staffId ? { recorded_by: staffId } : {}),
  }
  await db.sales.insert(doc)
  return doc
}

/** Soft-deleted with a trail: a void changes a profit figure already read. */
export async function voidSale(
  db: AppDatabase,
  saleId: string,
  reason?: string,
  staffId?: string,
): Promise<void> {
  const doc = await db.sales.findOne(saleId).exec()
  if (!doc) return

  const patched = await doc.patch({
    voided_at: now(),
    ...(staffId ? { voided_by: staffId } : {}),
    ...(reason?.trim() ? { void_reason: reason.trim() } : {}),
  })
  await patched.remove()
}
