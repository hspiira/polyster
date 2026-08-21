import { afterEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import type { EventDoc, Product } from '../schema'
import { createDatabase, type PolysterDatabase } from './database'
import {
  SCHEMA_HISTORY,
  SCHEMA_VERSION,
  STORE_NAMES,
  STORES,
  fingerprint,
} from './stores'

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

  it('keeps every collection the app had before', () => {
    for (const table of [
      'shops', 'staff', 'clients', 'measurement_fields', 'measurement_profiles',
      'orders', 'payments', 'order_stage_history', 'order_units', 'sales',
      'expenses', 'message_log', 'tenant_features',
    ]) {
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

describe('schema version', () => {
  /* The failure this guards: a store or an index changes, every other test
     still passes, and an installed app cannot open the database it has. */
  it('matches the fingerprint recorded for its version', () => {
    expect(SCHEMA_HISTORY[SCHEMA_VERSION]).toBe(fingerprint(STORES))
  })

  it('is the newest version in the history', () => {
    const versions = Object.keys(SCHEMA_HISTORY).map(Number)
    expect(SCHEMA_VERSION).toBe(Math.max(...versions))
  })

  it('has no gaps, so every shipped version is accounted for', () => {
    const versions = Object.keys(SCHEMA_HISTORY).map(Number).sort((a, b) => a - b)
    expect(versions).toEqual(Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1))
  })

  it('fingerprints the indexes, not just the store names', () => {
    const withExtraIndex = { ...STORES, shops: `${STORES.shops}, name` }
    expect(fingerprint(withExtraIndex)).not.toBe(fingerprint(STORES))
  })

  it('does not depend on the order stores are declared in', () => {
    const reversed = Object.fromEntries(Object.entries(STORES).reverse())
    expect(fingerprint(reversed)).toBe(fingerprint(STORES))
  })
})

describe('the v1 to v2 upgrade', () => {
  /* An installed app has payments with no shop_id. The order they belong to is
     where it comes from, and nothing else can supply it. */
  it('fills shop_id in from the order', async () => {
    const name = `upgrade_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const v1 = new Dexie(name)
    v1.version(1).stores({ ...STORES, payments: 'id, order_id' })
    await v1.table('orders').add({ id: 'o1', shop_id: 'shop-1' })
    await v1.table('orders').add({ id: 'o2', shop_id: 'shop-2' })
    await v1.table('payments').bulkAdd([
      { id: 'p1', order_id: 'o1', amount_minor: 1000 },
      { id: 'p2', order_id: 'o2', amount_minor: 2000 },
    ])
    v1.close()

    const db = createDatabase(name)
    opened.push(db)
    await db.open()

    expect((await db.payments.get('p1'))?.shop_id).toBe('shop-1')
    expect((await db.payments.get('p2'))?.shop_id).toBe('shop-2')
    expect(await db.payments.where('shop_id').equals('shop-1').count()).toBe(1)
  })

  // An orphan must not block the upgrade: the app has to open regardless.
  it('leaves a payment whose order is gone, and still opens', async () => {
    const name = `orphan_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const v1 = new Dexie(name)
    v1.version(1).stores({ ...STORES, payments: 'id, order_id' })
    await v1.table('payments').add({ id: 'p1', order_id: 'missing', amount_minor: 1000 })
    v1.close()

    const db = createDatabase(name)
    opened.push(db)
    await expect(db.open()).resolves.toBeTruthy()
    expect((await db.payments.get('p1'))?.shop_id).toBeUndefined()
  })

  it('does not overwrite a shop_id that is already there', async () => {
    const name = `keep_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const v1 = new Dexie(name)
    v1.version(1).stores({ ...STORES, payments: 'id, order_id' })
    await v1.table('orders').add({ id: 'o1', shop_id: 'shop-1' })
    await v1.table('payments').add({ id: 'p1', order_id: 'o1', shop_id: 'shop-kept' })
    v1.close()

    const db = createDatabase(name)
    opened.push(db)
    await db.open()

    expect((await db.payments.get('p1'))?.shop_id).toBe('shop-kept')
  })
})
