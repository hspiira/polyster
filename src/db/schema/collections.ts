/* A season or drop that products belong to. */

export const COLLECTION_STATUSES = ['draft', 'planned', 'active', 'sold_out', 'archived'] as const
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number]

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
