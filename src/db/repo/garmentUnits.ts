/* One physical garment, tracked through its life. */
import type { PolysterDatabase, Stored } from '../dexie/database'
import type { GarmentUnit, GarmentUnitStatus } from '../schema'
import { newId } from '../../lib/ids'
import { insertRow, listBy, now, observeBy, patchRow, type Observable } from './base'

export interface GarmentUnitInput {
  product_variant_id: string
  production_batch_id?: string
  serial_number: string
  status: GarmentUnitStatus
  customer_id?: string
  sold_at?: string
}

/** A shop's units, newest first. */
export function observeGarmentUnits(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<GarmentUnit>[]> {
  return observeBy(db.garment_units, 'shop_id', shopId, { key: 'created_at', dir: 'desc' })
}

export function listGarmentUnits(
  db: PolysterDatabase,
  shopId: string,
): Promise<Stored<GarmentUnit>[]> {
  return listBy(db.garment_units, 'shop_id', shopId, { key: 'created_at', dir: 'desc' })
}

function fields(input: GarmentUnitInput) {
  return {
    product_variant_id: input.product_variant_id,
    production_batch_id: input.production_batch_id || null,
    serial_number: input.serial_number.trim(),
    status: input.status,
    customer_id: input.customer_id || null,
    sold_at: input.status === 'sold' ? (input.sold_at ?? null) : null,
  }
}

export async function createGarmentUnit(
  db: PolysterDatabase,
  shopId: string,
  input: GarmentUnitInput,
): Promise<GarmentUnit> {
  const timestamp = now()
  const row: GarmentUnit = {
    id: newId(),
    shop_id: shopId,
    ...fields(input),
    // The passport URL carries this, never the id.
    public_token: newId(),
    created_at: timestamp,
    updated_at: timestamp,
  }
  return insertRow(db.garment_units, row, shopId, row.serial_number)
}

export async function updateGarmentUnit(
  db: PolysterDatabase,
  id: string,
  input: GarmentUnitInput,
): Promise<void> {
  await patchRow(db.garment_units, id, { ...fields(input), updated_at: now() }, {
    label: 'garment',
  })
}
