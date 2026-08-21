import { afterEach, describe, expect, it } from 'vitest'
import { REPLICATED_TABLES } from '../replication'
import type { EventDoc, Product } from '../schema'
import { createDatabase, type PolysterDatabase } from './database'
import { STORE_NAMES, STORES } from './stores'

const opened: PolysterDatabase[] = []

function fresh(): PolysterDatabase {
  const db = createDatabase(`dexie_${Date.now()}_${Math.random().toString(36).slice(2)}`)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
})

describe('stores', () => {
  it('opens every declared store', async () => {
    const db = fresh()
    await db.open()
    expect(db.tables.map((t) => t.name).sort()).toEqual([...STORE_NAMES].sort())
  })

  it('keeps every collection RxDB replicated', () => {
    for (const table of REPLICATED_TABLES) {
      expect(STORE_NAMES).toContain(table)
    }
  })

  it('brings the eleven formerly online-only areas local', () => {
    for (const table of [
      'products', 'product_variants', 'product_categories', 'collections',
      'materials', 'suppliers', 'inventory_items', 'inventory_movements',
      'production_batches', 'production_batch_costs', 'garment_units',
    ]) {
      expect(STORE_NAMES).toContain(table)
    }
  })

  it('declares each store once', () => {
    expect(new Set(STORE_NAMES).size).toBe(STORE_NAMES.length)
  })

  it('keys every store by id', () => {
    for (const [name, spec] of Object.entries(STORES)) {
      expect(spec.split(',')[0]?.trim(), name).toBe('id')
    }
  })

  it('is past the ceiling RxDB imposed', () => {
    expect(STORE_NAMES.length).toBeGreaterThan(13)
  })
})

describe('typing', () => {
  it('exposes a table for every store', async () => {
    const db = fresh()
    await db.open()
    for (const name of STORE_NAMES) {
      expect(typeof (db as unknown as Record<string, unknown>)[name], name).toBe('object')
    }
  })

  it('round trips a fully typed product', async () => {
    const db = fresh()
    const product: Product = {
      id: 'p1', shop_id: 's1', category_id: null, collection_id: null,
      name: 'Kanzu', description: null, brand: null, product_type: 'garment',
      image_url: null, active: true, created_at: 'x', updated_at: 'x',
    }
    await db.products.put(product)
    expect(await db.products.get('p1')).toEqual(product)
  })

  it('indexes the new stores by shop', async () => {
    const db = fresh()
    const base = {
      shop_id: 's1', category_id: null, collection_id: null, description: null,
      brand: null, product_type: 'garment', image_url: null, active: true,
      created_at: 'x', updated_at: 'x',
    } as const
    await db.products.bulkPut([
      { ...base, id: 'p1', name: 'a' },
      { ...base, id: 'p2', name: 'b' },
      { ...base, id: 'p3', name: 'c', shop_id: 's2' },
    ])
    expect(await db.products.where('shop_id').equals('s1').count()).toBe(2)
  })
})

describe('audit', () => {
  const at = (n: number) => `2026-08-2${n}T00:00:00.000Z`
  const event = (id: string, over: Partial<EventDoc> = {}): EventDoc => ({
    id, shop_id: 's1', at: at(1), entity: 'orders', entity_id: 'o1',
    action: 'updated', ...over,
  })

  it('reads a shop feed in time order', async () => {
    const db = fresh()
    await db.events.bulkPut([
      event('e1', { at: at(3) }),
      event('e2', { at: at(1) }),
      event('e3', { at: at(2), shop_id: 's2' }),
    ])
    const feed = await db.events
      .where('[shop_id+at]').between(['s1', ''], ['s1', '\uffff']).toArray()
    expect(feed.map((e) => e.id)).toEqual(['e2', 'e1'])
  })

  it('reads one record\'s whole history', async () => {
    const db = fresh()
    await db.events.bulkPut([
      event('e1', { action: 'created', actor_staff_id: 'ama' }),
      event('e2', { action: 'updated', actor_staff_id: 'ben', summary: 'took payment' }),
      event('e3', { entity_id: 'o2' }),
    ])
    const history = await db.events
      .where('[entity+entity_id]').equals(['orders', 'o1']).toArray()
    expect(history.map((e) => e.actor_staff_id)).toEqual(['ama', 'ben'])
  })

  it('records an event with no actor', async () => {
    const db = fresh()
    await db.events.put(event('e1'))
    expect((await db.events.get('e1'))?.actor_staff_id).toBeUndefined()
  })
})

describe('shop-defined lists', () => {
  it('holds categories the app did not ship', async () => {
    const db = fresh()
    await db.expense_categories.put({
      id: 'x1', shop_id: 's1', label: 'Boda for deliveries',
      active: true, display_order: 0, created_at: 'x', updated_at: 'x',
    })
    expect((await db.expense_categories.get('x1'))?.label).toBe('Boda for deliveries')
  })

  it('retires one without losing it', async () => {
    const db = fresh()
    const row = {
      id: 'x1', shop_id: 's1', label: 'Old', active: true,
      display_order: 0, created_at: 'x', updated_at: 'x',
    }
    await db.material_types.put(row)
    await db.material_types.update('x1', { active: false })
    expect(await db.material_types.get('x1')).toMatchObject({ label: 'Old', active: false })
  })
})

describe('reading and writing', () => {
  it('round trips a row', async () => {
    const db = fresh()
    await db.clients.put({
      id: 'c1', shop_id: 's1', name: 'Mrs. Okello',
      created_at: '2026-08-21T00:00:00.000Z', updated_at: '2026-08-21T00:00:00.000Z',
    })
    expect((await db.clients.get('c1'))?.name).toBe('Mrs. Okello')
  })

  it('looks rows up by a declared index', async () => {
    const db = fresh()
    const at = '2026-08-21T00:00:00.000Z'
    for (const [id, shop] of [['a', 's1'], ['b', 's1'], ['c', 's2']] as const) {
      await db.clients.put({ id, shop_id: shop, name: id, created_at: at, updated_at: at })
    }
    expect(await db.clients.where('shop_id').equals('s1').count()).toBe(2)
  })

  it('queries a compound index as a range', async () => {
    const db = fresh()
    const base = {
      client_id: 'c1', order_type: 'tailor_made', reference: 'r', currency: 'UGX',
      summary: 's', stage: 'measured', price_total_minor: 0, price_adjustment_minor: 0,
      rental_deposit_minor: 0, created_at: 'x', updated_at: 'x',
    } as const
    await db.orders.bulkPut([
      { ...base, id: 'o1', shop_id: 's1', pickup_due_date: '2026-09-01' },
      { ...base, id: 'o2', shop_id: 's1', pickup_due_date: '2026-09-05' },
      { ...base, id: 'o3', shop_id: 's2', pickup_due_date: '2026-09-02' },
    ] as never)

    const rows = await db.orders
      .where('[shop_id+pickup_due_date]')
      .between(['s1', '2026-09-01'], ['s1', '2026-09-04'])
      .toArray()

    expect(rows.map((r) => r.id)).toEqual(['o1'])
  })

  it('writes across stores atomically', async () => {
    const db = fresh()
    await expect(
      db.transaction('rw', db.orders, db.order_stage_history, async () => {
        await db.order_stage_history.put({ id: 'h1', order_id: 'o1' } as never)
        throw new Error('write failed halfway')
      }),
    ).rejects.toThrow('write failed halfway')

    expect(await db.order_stage_history.get('h1')).toBeUndefined()
  })
})
