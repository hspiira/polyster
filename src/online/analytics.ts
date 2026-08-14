/* Profitability and valuation (§82), online-only. Revenue is each sold unit's
   list price: sales carry cash but no product link to join against. */
import { listProducts, listAllProductVariants, type Product, type ProductVariant } from './catalogue'
import { listCollections, type Collection } from './collections'
import {
  listProductionBatches,
  listAllBatchCosts,
  type ProductionBatch,
  type ProductionBatchCost,
} from './production'
import { listGarmentUnits, type GarmentUnit } from './garmentUnits'
import { listMaterials, type Material } from './materials'
import { listInventoryItems, type InventoryItem } from './inventory'

export interface AnalyticsBundle {
  products: Product[]
  variants: ProductVariant[]
  collections: Collection[]
  batches: ProductionBatch[]
  batchCosts: ProductionBatchCost[]
  garmentUnits: GarmentUnit[]
  materials: Material[]
  inventoryItems: InventoryItem[]
}

export async function loadAnalyticsBundle(shopId: string): Promise<AnalyticsBundle> {
  // Each fetcher already maps its own Supabase error through friendlyError;
  // nothing further to translate here.
  const [products, variants, collections, batches, garmentUnits, materials, inventoryItems, batchCosts] =
    await Promise.all([
      listProducts(shopId),
      listAllProductVariants(shopId),
      listCollections(shopId),
      listProductionBatches(shopId),
      listGarmentUnits(shopId),
      listMaterials(shopId),
      listInventoryItems(shopId),
      listAllBatchCosts(shopId),
    ])
  return { products, variants, collections, batches, batchCosts, garmentUnits, materials, inventoryItems }
}

export interface ProfitabilityRow {
  id: string
  label: string
  unitsSold: number
  revenueMinor: number
  costMinor: number
  grossProfitMinor: number
  /** null rather than 0 when there is no revenue to divide by -- an undefined ratio, not a zero one. */
  marginPct: number | null
}

function marginPct(grossProfitMinor: number, revenueMinor: number): number | null {
  return revenueMinor > 0 ? (grossProfitMinor / revenueMinor) * 100 : null
}

export function batchProfitability({
  batches,
  batchCosts,
  garmentUnits,
  variants,
}: Pick<AnalyticsBundle, 'batches' | 'batchCosts' | 'garmentUnits' | 'variants'>): ProfitabilityRow[] {
  const variantById = new Map(variants.map((v) => [v.id, v]))

  const costByBatch = new Map<string, number>()
  for (const cost of batchCosts) {
    costByBatch.set(cost.batch_id, (costByBatch.get(cost.batch_id) ?? 0) + cost.amount_minor)
  }

  const soldUnitsByBatch = new Map<string, GarmentUnit[]>()
  for (const unit of garmentUnits) {
    if (unit.status !== 'sold' || !unit.production_batch_id) continue
    const list = soldUnitsByBatch.get(unit.production_batch_id) ?? []
    list.push(unit)
    soldUnitsByBatch.set(unit.production_batch_id, list)
  }

  return batches.map((batch) => {
    const soldUnits = soldUnitsByBatch.get(batch.id) ?? []
    const revenueMinor = soldUnits.reduce(
      (sum, unit) => sum + (variantById.get(unit.product_variant_id)?.price_minor ?? 0),
      0,
    )
    const costMinor = costByBatch.get(batch.id) ?? 0
    const grossProfitMinor = revenueMinor - costMinor
    return {
      id: batch.id,
      label: batch.batch_number,
      unitsSold: soldUnits.length,
      revenueMinor,
      costMinor,
      grossProfitMinor,
      marginPct: marginPct(grossProfitMinor, revenueMinor),
    }
  })
}

export function productProfitability({
  products,
  variants,
  batches,
  batchCosts,
  garmentUnits,
}: Pick<
  AnalyticsBundle,
  'products' | 'variants' | 'batches' | 'batchCosts' | 'garmentUnits'
>): ProfitabilityRow[] {
  const variantById = new Map(variants.map((v) => [v.id, v]))
  const batchProductById = new Map(batches.map((b) => [b.id, b.product_id]))

  const costByProduct = new Map<string, number>()
  for (const cost of batchCosts) {
    const productId = batchProductById.get(cost.batch_id)
    if (!productId) continue
    costByProduct.set(productId, (costByProduct.get(productId) ?? 0) + cost.amount_minor)
  }

  const soldUnitsByProduct = new Map<string, GarmentUnit[]>()
  for (const unit of garmentUnits) {
    if (unit.status !== 'sold') continue
    const variant = variantById.get(unit.product_variant_id)
    if (!variant) continue
    const list = soldUnitsByProduct.get(variant.product_id) ?? []
    list.push(unit)
    soldUnitsByProduct.set(variant.product_id, list)
  }

  return products.map((product) => {
    const soldUnits = soldUnitsByProduct.get(product.id) ?? []
    const revenueMinor = soldUnits.reduce(
      (sum, unit) => sum + (variantById.get(unit.product_variant_id)?.price_minor ?? 0),
      0,
    )
    const costMinor = costByProduct.get(product.id) ?? 0
    const grossProfitMinor = revenueMinor - costMinor
    return {
      id: product.id,
      label: product.name,
      unitsSold: soldUnits.length,
      revenueMinor,
      costMinor,
      grossProfitMinor,
      marginPct: marginPct(grossProfitMinor, revenueMinor),
    }
  })
}

export interface CollectionPerformanceRow extends ProfitabilityRow {
  unitsProduced: number
  unitsRemaining: number
}

export function collectionPerformance({
  collections,
  products,
  variants,
  batches,
  batchCosts,
  garmentUnits,
}: Pick<
  AnalyticsBundle,
  'collections' | 'products' | 'variants' | 'batches' | 'batchCosts' | 'garmentUnits'
>): CollectionPerformanceRow[] {
  const variantById = new Map(variants.map((v) => [v.id, v]))
  const batchProductById = new Map(batches.map((b) => [b.id, b.product_id]))

  const productIdsByCollection = new Map<string, Set<string>>()
  for (const product of products) {
    if (!product.collection_id) continue
    const set = productIdsByCollection.get(product.collection_id) ?? new Set<string>()
    set.add(product.id)
    productIdsByCollection.set(product.collection_id, set)
  }

  return collections.map((collection) => {
    const productIds = productIdsByCollection.get(collection.id) ?? new Set<string>()

    const unitsForCollection = garmentUnits.filter((unit) => {
      const variant = variantById.get(unit.product_variant_id)
      return variant ? productIds.has(variant.product_id) : false
    })
    const soldUnits = unitsForCollection.filter((unit) => unit.status === 'sold')

    const revenueMinor = soldUnits.reduce(
      (sum, unit) => sum + (variantById.get(unit.product_variant_id)?.price_minor ?? 0),
      0,
    )
    const costMinor = batchCosts.reduce((sum, cost) => {
      const productId = batchProductById.get(cost.batch_id)
      return productId && productIds.has(productId) ? sum + cost.amount_minor : sum
    }, 0)
    const grossProfitMinor = revenueMinor - costMinor

    return {
      id: collection.id,
      label: collection.name,
      unitsSold: soldUnits.length,
      unitsProduced: unitsForCollection.length,
      unitsRemaining: unitsForCollection.length - soldUnits.length,
      revenueMinor,
      costMinor,
      grossProfitMinor,
      marginPct: marginPct(grossProfitMinor, revenueMinor),
    }
  })
}

export interface InventoryValuation {
  finishedGoodsValueMinor: number
  materialsValueMinor: number
  totalValueMinor: number
}

export function inventoryValuation({
  inventoryItems,
  variants,
  materials,
}: Pick<AnalyticsBundle, 'inventoryItems' | 'variants' | 'materials'>): InventoryValuation {
  const variantById = new Map(variants.map((v) => [v.id, v]))
  const materialById = new Map(materials.map((m) => [m.id, m]))

  let finishedGoodsValueMinor = 0
  let materialsValueMinor = 0

  for (const item of inventoryItems) {
    if (item.item_type === 'product_variant' && item.product_variant_id) {
      const variant = variantById.get(item.product_variant_id)
      if (variant) finishedGoodsValueMinor += Math.round(item.quantity * variant.cost_minor)
    } else if (item.item_type === 'material' && item.material_id) {
      const material = materialById.get(item.material_id)
      if (material) materialsValueMinor += Math.round(item.quantity * material.unit_cost_minor)
    }
  }

  return {
    finishedGoodsValueMinor,
    materialsValueMinor,
    totalValueMinor: finishedGoodsValueMinor + materialsValueMinor,
  }
}
