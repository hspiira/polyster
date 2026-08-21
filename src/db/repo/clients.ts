import type { PolysterDatabase, Stored } from '../dexie/database'
import type { ClientDoc } from '../schema'
import { newId } from '../../lib/ids'
import {
  insertRow,
  now,
  observeBy,
  observeRow,
  patchRow,
  softDeleteRow,
  type Observable,
} from './base'

export interface ClientInput {
  name: string
  phone?: string
  notes?: string
}

/** Every client of a shop, by name. */
export function observeClients(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<ClientDoc>[]> {
  return observeBy(db.clients, 'shop_id', shopId, { key: 'name' })
}

export function observeClient(
  db: PolysterDatabase,
  clientId: string,
): Observable<Stored<ClientDoc> | null> {
  return observeRow(db.clients, clientId)
}

export async function createClient(
  db: PolysterDatabase,
  shopId: string,
  input: ClientInput,
): Promise<ClientDoc> {
  const timestamp = now()
  const doc: ClientDoc = {
    id: newId(),
    shop_id: shopId,
    name: input.name.trim(),
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  }
  return insertRow(db.clients, doc, shopId, doc.name)
}

export async function updateClient(
  db: PolysterDatabase,
  clientId: string,
  input: ClientInput,
): Promise<void> {
  await patchRow(
    db.clients,
    clientId,
    {
      name: input.name.trim(),
      phone: input.phone?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      updated_at: now(),
    },
    { label: 'client' },
  )
}

/** Soft delete. Never a hard delete -- other devices may not have synced yet. */
export async function archiveClient(db: PolysterDatabase, clientId: string): Promise<void> {
  await softDeleteRow(db.clients, clientId)
}
