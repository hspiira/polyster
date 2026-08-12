/** Collections. Online-only, see catalogue.ts's header comment for why. */
import { getSupabase } from '../lib/supabaseClient'
import { friendlyError } from './friendlyError'

export type CollectionStatus = 'draft' | 'planned' | 'active' | 'sold_out' | 'archived'
export const COLLECTION_STATUSES: readonly CollectionStatus[] = [
  'draft',
  'planned',
  'active',
  'sold_out',
  'archived',
]

export interface Collection {
  id: string
  shop_id: string
  name: string
  code: string | null
  description: string | null
  status: CollectionStatus
  release_date: string | null
  cover_image_url: string | null
  latitude: number | null
  longitude: number | null
  coordinate_label: string | null
  story: string | null
  tagline: string | null
  production_limit: number | null
  created_at: string
  updated_at: string
}

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

function toRow(input: CollectionInput) {
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

export async function listCollections(shopId: string): Promise<Collection[]> {
  const { data, error } = await getSupabase()
    .from('collections')
    .select()
    .eq('shop_id', shopId)
    .order('release_date', { ascending: false, nullsFirst: false })
  if (error) throw friendlyError(error)
  return data
}

export async function createCollection(shopId: string, input: CollectionInput): Promise<Collection> {
  const { data, error } = await getSupabase()
    .from('collections')
    .insert({ shop_id: shopId, ...toRow(input) })
    .select()
    .single()
  if (error) throw friendlyError(error)
  return data
}

export async function updateCollection(id: string, input: CollectionInput): Promise<void> {
  const { error } = await getSupabase().from('collections').update(toRow(input)).eq('id', id)
  if (error) throw friendlyError(error)
}

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await getSupabase().from('collections').delete().eq('id', id)
  if (error) throw friendlyError(error)
}

const COLLECTION_IMAGE_BUCKET = 'collection-images'

export async function uploadCollectionImage(shopId: string, file: File): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : undefined
  const path = `${shopId}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`
  const { error } = await getSupabase().storage.from(COLLECTION_IMAGE_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
  })
  if (error) throw new Error(error.message)
  const { data } = getSupabase().storage.from(COLLECTION_IMAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function deleteCollectionImage(imageUrl: string): Promise<void> {
  const marker = `/${COLLECTION_IMAGE_BUCKET}/`
  const index = imageUrl.indexOf(marker)
  if (index === -1) return
  const path = imageUrl.slice(index + marker.length)
  await getSupabase().storage.from(COLLECTION_IMAGE_BUCKET).remove([path])
}
