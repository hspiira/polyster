import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type PolysterDatabase } from '../dexie/database'
import { newId } from '../../lib/ids'
import {
  addBatchCost,
  createCollection,
  createGarmentUnit,
  createMaterial,
  createProduct,
  createProductCategory,
  createProductVariant,
  createProductionBatch,
  createShop,
  createSupplier,
  deleteCollection,
  findInventoryItem,
  getOrCreateInventoryItem,
  listAllBatchCosts,
  listAllProductVariants,
  listBatchCosts,
  listCollections,
  listInventoryItems,
  listMovements,
  listProductCategories,
  listSuppliers,
  loadAnalyticsBundle,
  patchRow,
  recordMovement,
  removeBatchCost,
  setSupplierActive,
  summarizeBatchCosts,
  updateBatchProgress,
  updateProductVariant,
} from './index'

const opened: PolysterDatabase[] = []
let counter = 0

function fresh(): PolysterDatabase {
  const db = createDatabase(`making_${++counter}`)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
})

async function shopWithProduct() {
  const db = fresh()
  const shop = await createShop(db, { name: 'NORTH//FOUND' })
  const product = await createProduct(db, shop.id, { name: 'Field Jacket', product_type: 'garment' })
  return { db, shopId: shop.id, productId: product.id }
}

describe('product variants', () => {
  it('refuses a SKU another variant in the shop already uses', async () => {
    const { db, shopId, productId } = await shopWithProduct()
    await createProductVariant(db, shopId, productId, { sku: 'FJ-M', price_minor: 1, cost_minor: 1 })

    await expect(
      createProductVariant(db, shopId, productId, { sku: 'FJ-M', price_minor: 1, cost_minor: 1 }),
    ).rejects.toThrow(/already used/)
  })

  it('allows the same SKU in a different shop', async () => {
    const { db, productId } = await shopWithProduct()
    const other = await createShop(db, { name: 'Kampala Tailors' })
    await createProductVariant(db, 'shop-a', productId, {
      sku: 'FJ-M',
      price_minor: 1,
      cost_minor: 1,
    })
    const otherProduct = await createProduct(db, other.id, {
      name: 'Kanzu',
      product_type: 'garment',
    })
    await expect(
      createProductVariant(db, other.id, otherProduct.id, {
        sku: 'FJ-M',
        price_minor: 1,
        cost_minor: 1,
      }),
    ).resolves.toBeTruthy()
  })

  it('lets a variant keep its own SKU on edit', async () => {
    const { db, shopId, productId } = await shopWithProduct()
    const variant = await createProductVariant(db, shopId, productId, {
      sku: 'FJ-M',
      price_minor: 1,
      cost_minor: 1,
    })
    await expect(
      updateProductVariant(db, variant.id, { sku: 'FJ-M', price_minor: 2, cost_minor: 1 }),
    ).resolves.toBeUndefined()
  })

  it('lists every variant in the shop across its products', async () => {
    const { db, shopId, productId } = await shopWithProduct()
    const second = await createProduct(db, shopId, { name: 'Overshirt', product_type: 'garment' })
    await createProductVariant(db, shopId, productId, { sku: 'FJ-M', price_minor: 1, cost_minor: 1 })
    await createProductVariant(db, shopId, second.id, { sku: 'OS-L', price_minor: 1, cost_minor: 1 })

    expect((await listAllProductVariants(db, shopId)).map((v) => v.sku)).toEqual(['FJ-M', 'OS-L'])
  })
})

describe('inventory', () => {
  it('creates the item once and finds it after', async () => {
    const db = fresh()
    const first = await getOrCreateInventoryItem(db, 's1', 'material', { materialId: 'm1' }, 'm')
    const again = await getOrCreateInventoryItem(db, 's1', 'material', { materialId: 'm1' }, 'm')

    expect(again.id).toBe(first.id)
    expect(await listInventoryItems(db, 's1')).toHaveLength(1)
  })

  it('refuses an item with no variant or material behind it', async () => {
    const db = fresh()
    await expect(
      getOrCreateInventoryItem(db, 's1', 'material', {}, 'm'),
    ).rejects.toThrow(/required/)
  })

  it('findInventoryItem never creates one', async () => {
    const db = fresh()
    expect(await findInventoryItem(db, 's1', 'material', { materialId: 'm1' })).toBeNull()
    expect(await listInventoryItems(db, 's1')).toHaveLength(0)
  })

  // Supabase applied this with a trigger; here the movement and the balance
  // are one transaction, so the ledger cannot disagree with the total.
  it('applies a movement to the running total', async () => {
    const db = fresh()
    const item = await getOrCreateInventoryItem(db, 's1', 'material', { materialId: 'm1' }, 'm')

    await recordMovement(db, 's1', item.id, { movement_type: 'purchase', quantity: 40 })
    await recordMovement(db, 's1', item.id, { movement_type: 'production', quantity: -15 })

    expect((await db.inventory_items.get(item.id))?.quantity).toBe(25)
    expect(await listMovements(db, item.id)).toHaveLength(2)
  })

  it('refuses a movement of zero', async () => {
    const db = fresh()
    const item = await getOrCreateInventoryItem(db, 's1', 'material', { materialId: 'm1' }, 'm')
    await expect(
      recordMovement(db, 's1', item.id, { movement_type: 'purchase', quantity: 0 }),
    ).rejects.toThrow(/non-zero/)
  })

  it('refuses an adjustment with no reason', async () => {
    const db = fresh()
    const item = await getOrCreateInventoryItem(db, 's1', 'material', { materialId: 'm1' }, 'm')
    await expect(
      recordMovement(db, 's1', item.id, { movement_type: 'adjustment', quantity: 5 }),
    ).rejects.toThrow(/needs a reason/)
  })

  // The failure this guards: a ledger line recorded against a total that was
  // never updated, or the reverse.
  it('writes neither the movement nor the balance when the item is gone', async () => {
    const db = fresh()
    await expect(
      recordMovement(db, 's1', newId(), { movement_type: 'purchase', quantity: 5 }),
    ).rejects.toThrow()
    expect(await db.inventory_movements.count()).toBe(0)
  })
})

describe('materials', () => {
  it('opens the ledger with the starting quantity', async () => {
    const db = fresh()
    const shop = await createShop(db, { name: 'NORTH//FOUND' })
    const material = await createMaterial(db, shop.id, {
      name: 'Waxed cotton',
      material_type: 'fabric',
      unit: 'm',
      quantity_on_hand: 60,
      reorder_level: 10,
      unit_cost_minor: 25000,
    })

    const item = await findInventoryItem(db, shop.id, 'material', { materialId: material.id })
    expect(item?.quantity).toBe(60)
    const movements = await listMovements(db, item!.id)
    expect(movements).toHaveLength(1)
    expect(movements[0]?.movement_type).toBe('adjustment')
  })

  it('creates no ledger line when it starts at zero', async () => {
    const db = fresh()
    const shop = await createShop(db, { name: 'NORTH//FOUND' })
    const material = await createMaterial(db, shop.id, {
      name: 'Thread',
      material_type: 'thread',
      unit: 'reel',
      quantity_on_hand: 0,
      reorder_level: 0,
      unit_cost_minor: 500,
    })

    expect(await findInventoryItem(db, shop.id, 'material', { materialId: material.id })).toBeNull()
  })

  it('takes the currency off the shop', async () => {
    const db = fresh()
    const shop = await createShop(db, { name: 'NORTH//FOUND' })
    const material = await createMaterial(db, shop.id, {
      name: 'Waxed cotton',
      material_type: 'fabric',
      unit: 'm',
      quantity_on_hand: 0,
      reorder_level: 0,
      unit_cost_minor: 1,
    })
    expect(material.currency).toBe(shop.currency)
  })
})

describe('production batches', () => {
  it('starts planned, with nothing produced', async () => {
    const { db, shopId, productId } = await shopWithProduct()
    const batch = await createProductionBatch(db, shopId, {
      product_id: productId,
      batch_number: 'B-001',
      planned_quantity: 50,
    })

    expect(batch.status).toBe('planned')
    expect(batch.produced_quantity).toBe(0)
    expect(batch.started_at).toBeNull()
  })

  it('refuses accepted plus rejected above produced', async () => {
    const { db, shopId, productId } = await shopWithProduct()
    const batch = await createProductionBatch(db, shopId, {
      product_id: productId,
      batch_number: 'B-001',
      planned_quantity: 50,
    })

    await expect(
      updateBatchProgress(
        db,
        batch.id,
        {
          status: 'quality_control',
          produced_quantity: 10,
          accepted_quantity: 8,
          rejected_quantity: 5,
        },
        'planned',
      ),
    ).rejects.toThrow(/cannot be more than produced/)
  })

  it('stamps started_at once and never again', async () => {
    const { db, shopId, productId } = await shopWithProduct()
    const batch = await createProductionBatch(db, shopId, {
      product_id: productId,
      batch_number: 'B-001',
      planned_quantity: 50,
    })

    await updateBatchProgress(
      db,
      batch.id,
      { status: 'in_production', produced_quantity: 0, accepted_quantity: 0, rejected_quantity: 0 },
      'planned',
    )
    expect((await db.production_batches.get(batch.id))?.started_at).toBeTypeOf('string')

    /* Pinned to a value the clock cannot produce, because two updates in the
       same millisecond would hide an overwrite. */
    const pinned = '2020-01-01T00:00:00.000Z'
    await patchRow(db.production_batches, batch.id, { started_at: pinned })

    await updateBatchProgress(
      db,
      batch.id,
      {
        status: 'quality_control',
        produced_quantity: 50,
        accepted_quantity: 48,
        rejected_quantity: 2,
      },
      'in_production',
    )
    expect((await db.production_batches.get(batch.id))?.started_at).toBe(pinned)
  })

  it('clears completed_at when a batch leaves completed', async () => {
    const { db, shopId, productId } = await shopWithProduct()
    const batch = await createProductionBatch(db, shopId, {
      product_id: productId,
      batch_number: 'B-001',
      planned_quantity: 1,
    })
    const done = {
      status: 'completed' as const,
      produced_quantity: 1,
      accepted_quantity: 1,
      rejected_quantity: 0,
    }
    await updateBatchProgress(db, batch.id, done, 'in_production')
    expect((await db.production_batches.get(batch.id))?.completed_at).toBeTypeOf('string')

    await updateBatchProgress(db, batch.id, { ...done, status: 'quality_control' }, 'completed')
    expect((await db.production_batches.get(batch.id))?.completed_at).toBeNull()
  })
})

describe('batch costs', () => {
  it('lists one batch, and the whole shop across batches', async () => {
    const { db, shopId, productId } = await shopWithProduct()
    const one = await createProductionBatch(db, shopId, {
      product_id: productId,
      batch_number: 'B-001',
      planned_quantity: 1,
    })
    const two = await createProductionBatch(db, shopId, {
      product_id: productId,
      batch_number: 'B-002',
      planned_quantity: 1,
    })
    await addBatchCost(db, shopId, one.id, { cost_type: 'materials', amount_minor: 500000 })
    await addBatchCost(db, shopId, two.id, { cost_type: 'labour', amount_minor: 200000 })

    expect(await listBatchCosts(db, one.id)).toHaveLength(1)
    expect(await listAllBatchCosts(db, shopId)).toHaveLength(2)
  })

  it('drops a removed line from both lists', async () => {
    const { db, shopId, productId } = await shopWithProduct()
    const batch = await createProductionBatch(db, shopId, {
      product_id: productId,
      batch_number: 'B-001',
      planned_quantity: 1,
    })
    const cost = await addBatchCost(db, shopId, batch.id, {
      cost_type: 'materials',
      amount_minor: 500000,
    })

    await removeBatchCost(db, cost.id)

    expect(await listBatchCosts(db, batch.id)).toEqual([])
    expect(await listAllBatchCosts(db, shopId)).toEqual([])
  })

  it('refuses a cost against a batch that is not here', async () => {
    const db = fresh()
    await expect(
      addBatchCost(db, 's1', newId(), { cost_type: 'materials', amount_minor: 1 }),
    ).rejects.toThrow()
  })
})

describe('summarizeBatchCosts', () => {
  it('divides the total by the usable units', () => {
    const result = summarizeBatchCosts([{ amount_minor: 300 }, { amount_minor: 200 }], 4)
    expect(result).toEqual({ totalMinor: 500, usableUnits: 4, costPerUnitMinor: 125 })
  })

  it('reports no per-unit cost when nothing is usable', () => {
    expect(summarizeBatchCosts([{ amount_minor: 500 }], 0).costPerUnitMinor).toBeNull()
  })
})

describe('garment units', () => {
  it('gives each unit its own passport token, never its id', async () => {
    const db = fresh()
    const unit = await createGarmentUnit(db, 's1', {
      product_variant_id: 'v1',
      serial_number: 'NF-0001',
      status: 'produced',
    })
    expect(unit.public_token).toBeTypeOf('string')
    expect(unit.public_token).not.toBe(unit.id)
  })

  it('only keeps sold_at while the unit is sold', async () => {
    const db = fresh()
    const unit = await createGarmentUnit(db, 's1', {
      product_variant_id: 'v1',
      serial_number: 'NF-0001',
      status: 'sold',
      sold_at: '2026-08-01T00:00:00.000Z',
    })
    expect(unit.sold_at).toBe('2026-08-01T00:00:00.000Z')

    const notSold = await createGarmentUnit(db, 's1', {
      product_variant_id: 'v1',
      serial_number: 'NF-0002',
      status: 'available',
      sold_at: '2026-08-01T00:00:00.000Z',
    })
    expect(notSold.sold_at).toBeNull()
  })
})

describe('suppliers, categories and collections', () => {
  it('keeps a deactivated supplier readable', async () => {
    const db = fresh()
    const supplier = await createSupplier(db, 's1', { name: 'Kampala Textiles' })
    await setSupplierActive(db, supplier.id, false)

    const all = await listSuppliers(db, 's1')
    expect(all).toHaveLength(1)
    expect(all[0]?.active).toBe(false)
  })

  it('hides a deleted collection but keeps the row', async () => {
    const db = fresh()
    const collection = await createCollection(db, 's1', { name: 'Harvest', status: 'draft' })
    await deleteCollection(db, collection.id)

    expect(await listCollections(db, 's1')).toEqual([])
    expect(await db.collections.get(collection.id)).toBeDefined()
  })

  it('sorts collections newest release first, undated last', async () => {
    const db = fresh()
    await createCollection(db, 's1', { name: 'Older', status: 'active', release_date: '2026-01-01' })
    await createCollection(db, 's1', { name: 'Newer', status: 'active', release_date: '2026-06-01' })
    await createCollection(db, 's1', { name: 'Undated', status: 'draft' })

    expect((await listCollections(db, 's1')).map((c) => c.name)).toEqual([
      'Newer',
      'Older',
      'Undated',
    ])
  })

  it('sorts categories by name', async () => {
    const db = fresh()
    await createProductCategory(db, 's1', 'Outerwear')
    await createProductCategory(db, 's1', 'Bags')

    expect((await listProductCategories(db, 's1')).map((c) => c.name)).toEqual([
      'Bags',
      'Outerwear',
    ])
  })
})

describe('loadAnalyticsBundle', () => {
  it('reads every part off the device', async () => {
    const { db, shopId, productId } = await shopWithProduct()
    await createProductVariant(db, shopId, productId, { sku: 'FJ-M', price_minor: 1, cost_minor: 1 })
    await createCollection(db, shopId, { name: 'Harvest', status: 'active' })
    await createProductionBatch(db, shopId, {
      product_id: productId,
      batch_number: 'B-001',
      planned_quantity: 1,
    })

    const bundle = await loadAnalyticsBundle(db, shopId)
    expect(bundle.products).toHaveLength(1)
    expect(bundle.variants).toHaveLength(1)
    expect(bundle.collections).toHaveLength(1)
    expect(bundle.batches).toHaveLength(1)
    expect(bundle.batchCosts).toEqual([])
  })
})
