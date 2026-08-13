import type { AppDatabase } from '../database'
import {
  type ClientDoc,
} from '../schema'
import { newId, now, loadOrThrow } from './shared'

// ---------------------------------------------------------------- clients

export async function createClient(
  db: AppDatabase,
  shopId: string,
  input: { name: string; phone?: string; notes?: string },
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
  await db.clients.insert(doc)
  return doc
}

export async function updateClient(
  db: AppDatabase,
  clientId: string,
  input: { name: string; phone?: string; notes?: string },
): Promise<void> {
  const doc = await loadOrThrow(db, 'clients', clientId, 'client')

  await doc.patch({
    name: input.name.trim(),
    phone: input.phone?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  })
}

/** Soft delete. Never a hard delete -- other devices may not have synced yet. */
export async function archiveClient(db: AppDatabase, clientId: string): Promise<void> {
  const doc = await db.clients.findOne(clientId).exec()
  await doc?.remove()
}
