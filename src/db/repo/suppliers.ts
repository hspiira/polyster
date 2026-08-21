/* Who materials are bought from. */
import type { PolysterDatabase, Stored } from '../dexie/database'
import type { Supplier } from '../schema'
import { newId } from '../../lib/ids'
import { insertRow, listBy, now, observeBy, patchRow, type Observable } from './base'

export interface SupplierInput {
  name: string
  phone?: string
  email?: string
  address?: string
  notes?: string
}

export function observeSuppliers(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<Supplier>[]> {
  return observeBy(db.suppliers, 'shop_id', shopId, { key: 'name' })
}

export function listSuppliers(db: PolysterDatabase, shopId: string): Promise<Stored<Supplier>[]> {
  return listBy(db.suppliers, 'shop_id', shopId, { key: 'name' })
}

function fields(input: SupplierInput) {
  return {
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
  }
}

export async function createSupplier(
  db: PolysterDatabase,
  shopId: string,
  input: SupplierInput,
): Promise<Supplier> {
  const timestamp = now()
  const row: Supplier = {
    id: newId(),
    shop_id: shopId,
    ...fields(input),
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
  }
  return insertRow(db.suppliers, row, shopId, row.name)
}

export async function updateSupplier(
  db: PolysterDatabase,
  id: string,
  input: SupplierInput,
): Promise<void> {
  await patchRow(db.suppliers, id, { ...fields(input), updated_at: now() }, { label: 'supplier' })
}

export async function setSupplierActive(
  db: PolysterDatabase,
  id: string,
  active: boolean,
): Promise<void> {
  await patchRow(db.suppliers, id, { active, updated_at: now() }, { label: 'supplier' })
}
