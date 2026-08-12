import { describe, expect, it } from 'vitest'
import {
  batchProfitability,
  collectionPerformance,
  inventoryValuation,
  productProfitability,
} from './analytics'
import type { ProductVariant, Product } from './catalogue'
import type { ProductionBatch, ProductionBatchCost } from './production'
import type { GarmentUnit } from './garmentUnits'
import type { Material } from './materials'
import type { InventoryItem } from './inventory'
import type { Collection } from './collections'

const variant = (over: Partial<ProductVariant> = {}): ProductVariant => ({
  id: 'v1',
  shop_id: 'shop-1',
  product_id: 'p1',
  sku: 'SKU-1',
  size: null,
  colour: null,
  price_minor: 50000,
  cost_minor: 20000,
  active: true,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  shop_id: 'shop-1',
  category_id: null,
  collection_id: null,
  name: 'Origin Tee',
  description: null,
  brand: null,
  product_type: 'garment',
  image_url: null,
  active: true,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

const batch = (over: Partial<ProductionBatch> = {}): ProductionBatch => ({
  id: 'b1',
  shop_id: 'shop-1',
  product_id: 'p1',
  batch_number: 'F002-B01',
  planned_quantity: 50,
  produced_quantity: 50,
  accepted_quantity: 50,
  rejected_quantity: 0,
  status: 'completed',
  started_at: null,
  completed_at: null,
  notes: null,
  rejected_reason: null,
  created_by: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

const batchCost = (over: Partial<ProductionBatchCost> = {}): ProductionBatchCost => ({
  id: crypto.randomUUID(),
  shop_id: 'shop-1',
  batch_id: 'b1',
  cost_type: 'materials',
  description: null,
  amount_minor: 100000,
  currency: 'UGX',
  created_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

const garmentUnit = (over: Partial<GarmentUnit> = {}): GarmentUnit => ({
  id: crypto.randomUUID(),
  shop_id: 'shop-1',
  product_variant_id: 'v1',
  production_batch_id: 'b1',
  serial_number: 'F002-B01-001',
  status: 'sold',
  customer_id: null,
  sold_at: null,
  public_token: 'tok',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  ...over,
})

describe('batchProfitability', () => {
  it('counts revenue at each sold unit\'s list price, minus the batch\'s recorded costs', () => {
    const [row] = batchProfitability({
      batches: [batch()],
      batchCosts: [batchCost({ amount_minor: 300000 })],
      garmentUnits: [garmentUnit(), garmentUnit(), garmentUnit({ status: 'available' })],
      variants: [variant()],
    })
    expect(row!.unitsSold).toBe(2)
    expect(row!.revenueMinor).toBe(100000)
    expect(row!.costMinor).toBe(300000)
    expect(row!.grossProfitMinor).toBe(-200000)
    expect(row!.marginPct).toBeCloseTo(-200)
  })

  it('returns a null margin rather than dividing by zero when nothing has sold', () => {
    const [row] = batchProfitability({
      batches: [batch()],
      batchCosts: [batchCost()],
      garmentUnits: [],
      variants: [variant()],
    })
    expect(row!.revenueMinor).toBe(0)
    expect(row!.marginPct).toBeNull()
  })
})

describe('productProfitability', () => {
  it('aggregates cost across every batch of the product, not just one', () => {
    const [row] = productProfitability({
      products: [product()],
      variants: [variant()],
      batches: [batch({ id: 'b1' }), batch({ id: 'b2' })],
      batchCosts: [batchCost({ batch_id: 'b1', amount_minor: 100000 }), batchCost({ batch_id: 'b2', amount_minor: 50000 })],
      garmentUnits: [garmentUnit({ production_batch_id: 'b1' })],
    })
    expect(row!.costMinor).toBe(150000)
    expect(row!.revenueMinor).toBe(50000)
  })
})

describe('collectionPerformance', () => {
  const collection = (over: Partial<Collection> = {}): Collection => ({
    id: 'c1',
    shop_id: 'shop-1',
    name: 'FOUND 002',
    code: null,
    description: null,
    status: 'active',
    release_date: null,
    cover_image_url: null,
    latitude: null,
    longitude: null,
    coordinate_label: null,
    story: null,
    tagline: null,
    production_limit: 50,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...over,
  })

  it('counts produced/sold/remaining units across every product in the collection', () => {
    const [row] = collectionPerformance({
      collections: [collection()],
      products: [product({ collection_id: 'c1' })],
      variants: [variant()],
      batches: [batch()],
      batchCosts: [batchCost({ amount_minor: 100000 })],
      garmentUnits: [garmentUnit(), garmentUnit({ status: 'available' }), garmentUnit({ status: 'available' })],
    })
    expect(row!.unitsProduced).toBe(3)
    expect(row!.unitsSold).toBe(1)
    expect(row!.unitsRemaining).toBe(2)
    expect(row!.revenueMinor).toBe(50000)
    expect(row!.costMinor).toBe(100000)
  })

  it('never attributes a product outside the collection to it', () => {
    const [row] = collectionPerformance({
      collections: [collection()],
      products: [product({ id: 'other-product', collection_id: null })],
      variants: [variant({ id: 'v2', product_id: 'other-product' })],
      batches: [],
      batchCosts: [],
      garmentUnits: [garmentUnit({ product_variant_id: 'v2' })],
    })
    expect(row!.unitsProduced).toBe(0)
  })
})

describe('inventoryValuation', () => {
  const material = (over: Partial<Material> = {}): Material => ({
    id: 'm1',
    shop_id: 'shop-1',
    supplier_id: null,
    name: 'Cotton',
    description: null,
    material_type: 'fabric',
    unit: 'metre',
    quantity_on_hand: 0,
    reorder_level: 0,
    unit_cost_minor: 3000,
    currency: 'UGX',
    composition: null,
    gsm: null,
    width: null,
    colour: null,
    pattern: null,
    supplier_reference: null,
    active: true,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...over,
  })

  const inventoryItem = (over: Partial<InventoryItem> = {}): InventoryItem => ({
    id: crypto.randomUUID(),
    shop_id: 'shop-1',
    item_type: 'product_variant',
    product_variant_id: 'v1',
    material_id: null,
    quantity: 10,
    unit: 'piece',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...over,
  })

  it('values finished goods at variant cost and materials at unit cost, summed separately and together', () => {
    const result = inventoryValuation({
      inventoryItems: [
        inventoryItem({ quantity: 10 }),
        inventoryItem({ item_type: 'material', product_variant_id: null, material_id: 'm1', quantity: 5 }),
      ],
      variants: [variant({ cost_minor: 20000 })],
      materials: [material({ unit_cost_minor: 3000 })],
    })
    expect(result.finishedGoodsValueMinor).toBe(200000)
    expect(result.materialsValueMinor).toBe(15000)
    expect(result.totalValueMinor).toBe(215000)
  })

  it('rounds a fractional quantity to a whole minor unit rather than accumulating fractional cents', () => {
    const result = inventoryValuation({
      inventoryItems: [inventoryItem({ item_type: 'material', product_variant_id: null, material_id: 'm1', quantity: 1.3 })],
      variants: [],
      materials: [material({ unit_cost_minor: 333 })],
    })
    expect(Number.isInteger(result.materialsValueMinor)).toBe(true)
  })
})
