import type { PolysterDatabase, Stored } from '../dexie/database'
import type { PaymentMethod, SaleDoc, ShopDoc } from '../schema'
import { newId } from '../../lib/ids'
import { insertRow, now, observeBy, voidRow, type Observable } from './base'

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

/** A shop's sales, most recent first. */
export function observeSales(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<SaleDoc>[]> {
  return observeBy(db.sales, 'shop_id', shopId, { key: 'sold_at', dir: 'desc' })
}

/** A sale is paid in full by definition; anything part-paid is an order. */
export async function recordSale(
  db: PolysterDatabase,
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
  return insertRow(db.sales, doc, shop.id, doc.item_description)
}

/** Retracted with a trail: a void changes a profit figure already read. */
export async function voidSale(
  db: PolysterDatabase,
  saleId: string,
  reason?: string,
  staffId?: string,
): Promise<void> {
  await voidRow(db.sales, saleId, { reason, staffId })
}
