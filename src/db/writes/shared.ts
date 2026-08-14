/* Id, timestamp and load helpers shared by every write. */
import type { RxCollection, RxDocument } from 'rxdb'
import type { AppDatabase, Collections } from '../database'

export function newId(): string {
  return crypto.randomUUID()
}

export function now(): string {
  return new Date().toISOString()
}

type DocOf<C> = C extends RxCollection<infer T> ? T : never

/* One place for "it is not here". Every write needs the same guard, and fifteen
   copies of the sentence meant fifteen places to change its wording. */
export async function loadOrThrow<K extends keyof Collections>(
  db: AppDatabase,
  collection: K,
  id: string,
  label: string,
): Promise<RxDocument<DocOf<Collections[K]>>> {
  const doc = await db[collection].findOne(id).exec()
  if (!doc) throw new Error(`That ${label} no longer exists on this device.`)
  return doc as unknown as RxDocument<DocOf<Collections[K]>>
}
