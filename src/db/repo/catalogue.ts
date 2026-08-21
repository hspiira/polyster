/* Products, their categories and their sellable variants. */
import type { PolysterDatabase, Stored } from '../dexie/database'
import type { Product, ProductCategory, ProductType, ProductVariant } from '../schema'
import { newId } from '../../lib/ids'
import {
  insertRow,
  listBy,
  liveQuery,
  loadOrThrow,
  now,
  observeBy,
  observeRow,
  patchRow,
  softDeleteRow,
  sortRows,
  type Observable,
} from './base'

// ------------------------------------------------------------ categories

export function observeProductCategories(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<ProductCategory>[]> {
  return observeBy(db.product_categories, 'shop_id', shopId, { key: 'name' })
}

export function listProductCategories(
  db: PolysterDatabase,
  shopId: string,
): Promise<Stored<ProductCategory>[]> {
  return listBy(db.product_categories, 'shop_id', shopId, { key: 'name' })
}

export async function createProductCategory(
  db: PolysterDatabase,
  shopId: string,
  name: string,
): Promise<ProductCategory> {
  const timestamp = now()
  const row: ProductCategory = {
    id: newId(),
    shop_id: shopId,
    name: name.trim(),
    created_at: timestamp,
    updated_at: timestamp,
  }
  return insertRow(db.product_categories, row, shopId, row.name)
}

export async function renameProductCategory(
  db: PolysterDatabase,
  id: string,
  name: string,
): Promise<void> {
  await patchRow(db.product_categories, id, { name: name.trim(), updated_at: now() }, {
    label: 'category',
  })
}

export async function deleteProductCategory(db: PolysterDatabase, id: string): Promise<void> {
  await softDeleteRow(db.product_categories, id)
}

// -------------------------------------------------------------- products

export interface NewProductInput {
  name: string
  description?: string
  brand?: string
  product_type: ProductType
  category_id?: string
  collection_id?: string
  image_url?: string
}

export function observeProducts(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<Product>[]> {
  return observeBy(db.products, 'shop_id', shopId, { key: 'name' })
}

export function listProducts(db: PolysterDatabase, shopId: string): Promise<Stored<Product>[]> {
  return listBy(db.products, 'shop_id', shopId, { key: 'name' })
}

export function observeProduct(
  db: PolysterDatabase,
  id: string,
): Observable<Stored<Product> | null> {
  return observeRow(db.products, id)
}

function productFields(input: NewProductInput) {
  return {
    name: input.name.trim(),
    product_type: input.product_type,
    description: input.description?.trim() || null,
    brand: input.brand?.trim() || null,
    category_id: input.category_id ?? null,
    collection_id: input.collection_id ?? null,
    image_url: input.image_url?.trim() || null,
  }
}

export async function createProduct(
  db: PolysterDatabase,
  shopId: string,
  input: NewProductInput,
): Promise<Product> {
  const timestamp = now()
  const row: Product = {
    id: newId(),
    shop_id: shopId,
    ...productFields(input),
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
  }
  return insertRow(db.products, row, shopId, row.name)
}

export async function updateProduct(
  db: PolysterDatabase,
  id: string,
  input: NewProductInput,
): Promise<void> {
  await patchRow(db.products, id, { ...productFields(input), updated_at: now() }, {
    label: 'product',
  })
}

export async function setProductActive(
  db: PolysterDatabase,
  id: string,
  active: boolean,
): Promise<void> {
  await patchRow(db.products, id, { active, updated_at: now() }, { label: 'product' })
}

// -------------------------------------------------------------- variants

export interface NewProductVariantInput {
  sku: string
  size?: string
  colour?: string
  price_minor: number
  cost_minor: number
}

export function observeProductVariants(
  db: PolysterDatabase,
  productId: string,
): Observable<Stored<ProductVariant>[]> {
  return observeBy(db.product_variants, 'product_id', productId, { key: 'sku' })
}

export function listProductVariants(
  db: PolysterDatabase,
  productId: string,
): Promise<Stored<ProductVariant>[]> {
  return listBy(db.product_variants, 'product_id', productId, { key: 'sku' })
}

/** Every variant in the shop, for pickers that are not scoped to one product. */
export function observeAllProductVariants(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<ProductVariant>[]> {
  return liveQuery(async () => sortRows(await variantsOf(db, shopId), { key: 'sku' }))
}

export async function listAllProductVariants(
  db: PolysterDatabase,
  shopId: string,
): Promise<Stored<ProductVariant>[]> {
  return sortRows(await variantsOf(db, shopId), { key: 'sku' })
}

/* product_variants is indexed by product, not shop, because that is how the
   detail page reads it. A shop-wide list walks its products instead. */
async function variantsOf(
  db: PolysterDatabase,
  shopId: string,
): Promise<Stored<ProductVariant>[]> {
  const products = await listBy(db.products, 'shop_id', shopId)
  const perProduct = await Promise.all(
    products.map((product) => listBy(db.product_variants, 'product_id', product.id)),
  )
  return perProduct.flat()
}

function variantFields(input: NewProductVariantInput) {
  return {
    sku: input.sku.trim(),
    size: input.size?.trim() || null,
    colour: input.colour?.trim() || null,
    price_minor: input.price_minor,
    cost_minor: input.cost_minor,
  }
}

export async function createProductVariant(
  db: PolysterDatabase,
  shopId: string,
  productId: string,
  input: NewProductVariantInput,
): Promise<ProductVariant> {
  const sku = input.sku.trim()
  const clash = (await variantsOf(db, shopId)).some((variant) => variant.sku === sku)
  if (clash) throw new Error('That SKU is already used by another variant in this shop.')

  const timestamp = now()
  const row: ProductVariant = {
    id: newId(),
    shop_id: shopId,
    product_id: productId,
    ...variantFields(input),
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
  }
  return insertRow(db.product_variants, row, shopId, row.sku)
}

export async function updateProductVariant(
  db: PolysterDatabase,
  id: string,
  input: NewProductVariantInput,
): Promise<void> {
  const variant = await loadOrThrow(db.product_variants, id, 'variant')
  const sku = input.sku.trim()
  const clash = (await variantsOf(db, variant.shop_id)).some(
    (other) => other.id !== id && other.sku === sku,
  )
  if (clash) throw new Error('That SKU is already used by another variant in this shop.')

  await patchRow(db.product_variants, id, { ...variantFields(input), updated_at: now() })
}

export async function setProductVariantActive(
  db: PolysterDatabase,
  id: string,
  active: boolean,
): Promise<void> {
  await patchRow(db.product_variants, id, { active, updated_at: now() }, { label: 'variant' })
}
