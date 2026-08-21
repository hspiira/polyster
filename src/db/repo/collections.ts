/* A season or drop that products belong to. */
import type { PolysterDatabase, Stored } from '../dexie/database'
import type { Collection, CollectionStatus } from '../schema'
import { newId } from '../../lib/ids'
import {
  insertRow,
  listBy,
  now,
  observeBy,
  patchRow,
  softDeleteRow,
  type Observable,
} from './base'

export interface CollectionInput {
  name: string
  code?: string
  description?: string
  status: CollectionStatus
  release_date?: string
  cover_image_url?: string
  latitude?: number
  longitude?: number
  coordinate_label?: string
  story?: string
  tagline?: string
  production_limit?: number
}

/** Newest release first; a collection with no date sorts last. */
export function observeCollections(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<Collection>[]> {
  return observeBy(db.collections, 'shop_id', shopId, { key: 'release_date', dir: 'desc' })
}

export function listCollections(
  db: PolysterDatabase,
  shopId: string,
): Promise<Stored<Collection>[]> {
  return listBy(db.collections, 'shop_id', shopId, { key: 'release_date', dir: 'desc' })
}

function fields(input: CollectionInput) {
  return {
    name: input.name.trim(),
    code: input.code?.trim() || null,
    description: input.description?.trim() || null,
    status: input.status,
    release_date: input.release_date || null,
    cover_image_url: input.cover_image_url?.trim() || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    coordinate_label: input.coordinate_label?.trim() || null,
    story: input.story?.trim() || null,
    tagline: input.tagline?.trim() || null,
    production_limit: input.production_limit ?? null,
  }
}

export async function createCollection(
  db: PolysterDatabase,
  shopId: string,
  input: CollectionInput,
): Promise<Collection> {
  const timestamp = now()
  const row: Collection = {
    id: newId(),
    shop_id: shopId,
    ...fields(input),
    created_at: timestamp,
    updated_at: timestamp,
  }
  return insertRow(db.collections, row, shopId, row.name)
}

export async function updateCollection(
  db: PolysterDatabase,
  id: string,
  input: CollectionInput,
): Promise<void> {
  await patchRow(db.collections, id, { ...fields(input), updated_at: now() }, {
    label: 'collection',
  })
}

export async function deleteCollection(db: PolysterDatabase, id: string): Promise<void> {
  await softDeleteRow(db.collections, id)
}
