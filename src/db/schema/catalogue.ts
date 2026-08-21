/* Products, their categories and their sellable variants. */

export const PRODUCT_TYPES = ['garment', 'accessory', 'service', 'rental', 'custom'] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]

export interface ProductCategory {
  id: string
  shop_id: string
  name: string
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  shop_id: string
  category_id: string | null
  collection_id: string | null
  name: string
  description: string | null
  brand: string | null
  product_type: ProductType
  image_url: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface ProductVariant {
  id: string
  shop_id: string
  product_id: string
  sku: string
  size: string | null
  colour: string | null
  price_minor: number
  cost_minor: number
  active: boolean
  created_at: string
  updated_at: string
}
