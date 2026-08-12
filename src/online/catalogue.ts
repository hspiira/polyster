/**
 * Catalogue: products, categories, variants. Online-only -- queries Supabase
 * directly rather than through RxDB. See supabaseClient.ts's header comment
 * for why.
 */
import { getSupabase } from '../lib/supabaseClient'

export type ProductType = 'garment' | 'accessory' | 'service' | 'rental' | 'custom'
export const PRODUCT_TYPES: readonly ProductType[] = [
  'garment',
  'accessory',
  'service',
  'rental',
  'custom',
]

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

function friendlyError(error: { code?: string; message: string }): Error {
  if (error.code === '23505') {
    return new Error('That SKU is already used by another variant in this shop.')
  }
  return new Error(error.message)
}

export async function listProductCategories(shopId: string): Promise<ProductCategory[]> {
  const { data, error } = await getSupabase()
    .from('product_categories')
    .select()
    .eq('shop_id', shopId)
    .order('name')
  if (error) throw friendlyError(error)
  return data
}

export async function createProductCategory(shopId: string, name: string): Promise<ProductCategory> {
  const { data, error } = await getSupabase()
    .from('product_categories')
    .insert({ shop_id: shopId, name: name.trim() })
    .select()
    .single()
  if (error) throw friendlyError(error)
  return data
}

export async function renameProductCategory(id: string, name: string): Promise<void> {
  const { error } = await getSupabase()
    .from('product_categories')
    .update({ name: name.trim() })
    .eq('id', id)
  if (error) throw friendlyError(error)
}

export async function deleteProductCategory(id: string): Promise<void> {
  const { error } = await getSupabase().from('product_categories').delete().eq('id', id)
  if (error) throw friendlyError(error)
}

export async function listProducts(shopId: string): Promise<Product[]> {
  const { data, error } = await getSupabase()
    .from('products')
    .select()
    .eq('shop_id', shopId)
    .order('name')
  if (error) throw friendlyError(error)
  return data
}

export async function getProduct(id: string): Promise<Product | null> {
  const { data, error } = await getSupabase().from('products').select().eq('id', id).maybeSingle()
  if (error) throw friendlyError(error)
  return data
}

export interface NewProductInput {
  name: string
  description?: string
  brand?: string
  product_type: ProductType
  category_id?: string
  collection_id?: string
  image_url?: string
}

export async function createProduct(shopId: string, input: NewProductInput): Promise<Product> {
  const { data, error } = await getSupabase()
    .from('products')
    .insert({
      shop_id: shopId,
      name: input.name.trim(),
      product_type: input.product_type,
      description: input.description?.trim() || null,
      brand: input.brand?.trim() || null,
      category_id: input.category_id ?? null,
      collection_id: input.collection_id ?? null,
      image_url: input.image_url?.trim() || null,
    })
    .select()
    .single()
  if (error) throw friendlyError(error)
  return data
}

export async function updateProduct(id: string, input: NewProductInput): Promise<void> {
  const { error } = await getSupabase()
    .from('products')
    .update({
      name: input.name.trim(),
      product_type: input.product_type,
      description: input.description?.trim() || null,
      brand: input.brand?.trim() || null,
      category_id: input.category_id ?? null,
      collection_id: input.collection_id ?? null,
      image_url: input.image_url?.trim() || null,
    })
    .eq('id', id)
  if (error) throw friendlyError(error)
}

export async function setProductActive(id: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().from('products').update({ active }).eq('id', id)
  if (error) throw friendlyError(error)
}

export async function listProductVariants(productId: string): Promise<ProductVariant[]> {
  const { data, error } = await getSupabase()
    .from('product_variants')
    .select()
    .eq('product_id', productId)
    .order('sku')
  if (error) throw friendlyError(error)
  return data
}

/** Every variant in the shop, across all products -- for pickers that aren't scoped to one product. */
export async function listAllProductVariants(shopId: string): Promise<ProductVariant[]> {
  const { data, error } = await getSupabase()
    .from('product_variants')
    .select()
    .eq('shop_id', shopId)
    .order('sku')
  if (error) throw friendlyError(error)
  return data
}

export interface NewProductVariantInput {
  sku: string
  size?: string
  colour?: string
  price_minor: number
  cost_minor: number
}

export async function createProductVariant(
  shopId: string,
  productId: string,
  input: NewProductVariantInput,
): Promise<ProductVariant> {
  const { data, error } = await getSupabase()
    .from('product_variants')
    .insert({
      shop_id: shopId,
      product_id: productId,
      sku: input.sku.trim(),
      size: input.size?.trim() || null,
      colour: input.colour?.trim() || null,
      price_minor: input.price_minor,
      cost_minor: input.cost_minor,
    })
    .select()
    .single()
  if (error) throw friendlyError(error)
  return data
}

export async function updateProductVariant(id: string, input: NewProductVariantInput): Promise<void> {
  const { error } = await getSupabase()
    .from('product_variants')
    .update({
      sku: input.sku.trim(),
      size: input.size?.trim() || null,
      colour: input.colour?.trim() || null,
      price_minor: input.price_minor,
      cost_minor: input.cost_minor,
    })
    .eq('id', id)
  if (error) throw friendlyError(error)
}

export async function setProductVariantActive(id: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().from('product_variants').update({ active }).eq('id', id)
  if (error) throw friendlyError(error)
}

const PRODUCT_IMAGE_BUCKET = 'product-images'

/** Uploads to "<shopId>/<uuid>.<ext>" and returns its public URL. */
export async function uploadProductImage(shopId: string, file: File): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : undefined
  const path = `${shopId}/${crypto.randomUUID()}${ext ? `.${ext}` : ''}`

  const { error } = await getSupabase().storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
  })
  if (error) throw new Error(error.message)

  const { data } = getSupabase().storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/** Best-effort cleanup when an image is replaced or removed. Never throws. */
export async function deleteProductImage(imageUrl: string): Promise<void> {
  const marker = `/${PRODUCT_IMAGE_BUCKET}/`
  const index = imageUrl.indexOf(marker)
  if (index === -1) return
  const path = imageUrl.slice(index + marker.length)
  await getSupabase().storage.from(PRODUCT_IMAGE_BUCKET).remove([path])
}
