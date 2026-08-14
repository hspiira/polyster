/* Read by anonymous visitors, so it calls the garment_passport() function
   rather than a table: that function is the entire security boundary. */
import { getSupabase } from '../lib/supabaseClient'

export interface GarmentPassport {
  shopName: string
  shopLogoUrl: string | null
  shopCountry: string | null
  productName: string
  productBrand: string | null
  variantSize: string | null
  variantColour: string | null
  serialNumber: string
  collectionName: string | null
  collectionTagline: string | null
  collectionStory: string | null
  collectionCoverImageUrl: string | null
  collectionProductionLimit: number | null
  batchNumber: string | null
}

/** Returns null for a wrong/unknown token or a shop that hasn't enabled this feature -- never which. */
export async function getGarmentPassport(token: string): Promise<GarmentPassport | null> {
  const { data, error } = await getSupabase().rpc('garment_passport', { p_token: token })
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) return null
  return {
    shopName: row.shop_name,
    shopLogoUrl: row.shop_logo_url,
    shopCountry: row.shop_country,
    productName: row.product_name,
    productBrand: row.product_brand,
    variantSize: row.variant_size,
    variantColour: row.variant_colour,
    serialNumber: row.serial_number,
    collectionName: row.collection_name,
    collectionTagline: row.collection_tagline,
    collectionStory: row.collection_story,
    collectionCoverImageUrl: row.collection_cover_image_url,
    collectionProductionLimit: row.collection_production_limit,
    batchNumber: row.batch_number,
  }
}

/** The shareable URL for a garment's passport -- QR codes (not yet rendered, see POLYSTER.md Phase 10) would encode this. */
export function garmentPassportUrl(token: string): string {
  return `${window.location.origin}/passport/${token}`
}
