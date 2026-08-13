/* Creates every schema with devMode on, which loads RxDB's schema checker and
   ajv. Both are dev-only in the app, so this moves that class of bug into CI. */
import { afterEach, describe, expect, it } from 'vitest'
import { createRxDatabase, type RxJsonSchema } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'
import {
  createDatabase,
  expenseMigrations,
  ordersStrategies,
  paymentsStrategies,
  saleMigrations,
  type AppDatabase,
} from './database'
import { REPLICATED_TABLES } from './replication'
import { orderSchema, paymentSchema, saleSchema } from './schema'

const created: AppDatabase[] = []

async function freshDatabase(): Promise<AppDatabase> {
  const db = await createDatabase({
    name: `test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    devMode: true,
  })
  created.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((db) => db.remove()))
})

describe('database', () => {
  it('creates every collection with dev-mode schema validation enabled', async () => {
    const db = await freshDatabase()
    expect(Object.keys(db.collections).sort()).toEqual([...REPLICATED_TABLES].sort())
  })

  it('declares no underscore-prefixed fields -- RxDB rejects them (SC8/SC1)', async () => {
    const db = await freshDatabase()
    for (const [name, collection] of Object.entries(db.collections)) {
      const declared = Object.keys(collection.schema.jsonSchema.properties).filter(
        (field) => field.startsWith('_'),
      )
      // RxDB injects _deleted/_rev/_meta/_attachments itself. _modified in
      // particular belongs to Postgres only -- see ./schema.ts.
      expect(declared, `${name} declares its own underscore fields`).not.toContain('_modified')
    }
  })

  it('has an RxDB collection for every table replication expects', async () => {
    const db = await freshDatabase()
    for (const tableName of REPLICATED_TABLES) {
      expect(db.collections[tableName], `missing collection: ${tableName}`).toBeDefined()
    }
  })

  it('accepts a realistic order and rejects a negative price', async () => {
    const db = await freshDatabase()
    const now = new Date().toISOString()

    await db.orders.insert({
      id: crypto.randomUUID(),
      shop_id: crypto.randomUUID(),
      client_id: crypto.randomUUID(),
      order_type: 'tailor_made',
      reference: '1408-K7M2Q',
      currency: 'UGX',
      summary: 'Two-piece suit, navy',
      stage: 'measured',
      price_total_minor: 250000,
      price_adjustment_minor: 0,
      rental_deposit_minor: 0,
      pickup_due_date: '2026-08-14',
      created_at: now,
      updated_at: now,
    })

    expect(await db.orders.count().exec()).toBe(1)

    await expect(
      db.orders.insert({
        id: crypto.randomUUID(),
        shop_id: crypto.randomUUID(),
        client_id: crypto.randomUUID(),
        order_type: 'tailor_made',
        reference: '1408-Q2M7K',
        currency: 'UGX',
        summary: 'Refund test',
        stage: 'measured',
        price_total_minor: -1,
        price_adjustment_minor: 0,
        rental_deposit_minor: 0,
        pickup_due_date: '2026-08-14',
        created_at: now,
        updated_at: now,
      }),
    ).rejects.toThrow()
  })

  it('rejects an order stage outside the allowed set', async () => {
    const db = await freshDatabase()
    const now = new Date().toISOString()

    await expect(
      db.orders.insert({
        id: crypto.randomUUID(),
        shop_id: crypto.randomUUID(),
        client_id: crypto.randomUUID(),
        order_type: 'tailor_made',
        reference: '1408-M2Q7K',
        currency: 'UGX',
        // @ts-expect-error -- deliberately outside OrderStage; the runtime
        // schema must reject it too, not just the compiler.
        stage: 'lost_in_the_back',
        summary: 'Kitenge dress',
        price_total_minor: 80000,
        price_adjustment_minor: 0,
        rental_deposit_minor: 0,
        pickup_due_date: '2026-08-14',
        created_at: now,
        updated_at: now,
      }),
    ).rejects.toThrow()
  })

  it('rejects a zero-amount payment', async () => {
    const db = await freshDatabase()

    await expect(
      db.payments.insert({
        id: crypto.randomUUID(),
        order_id: crypto.randomUUID(),
        amount_minor: 0,
        kind: 'payment',
        payment_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
        method: 'cash',
      }),
    ).rejects.toThrow()
  })

  it('accepts an order unit and rejects a negative price', async () => {
    const db = await freshDatabase()
    const now = new Date().toISOString()
    const orderId = crypto.randomUUID()

    await db.order_units.insert({
      id: crypto.randomUUID(),
      order_id: orderId,
      position: 0,
      item_description: 'Kanzu, navy',
      price_minor: 45000,
      measurements: { chest: 72 },
      fabric_source: 'client',
      done: false,
      created_at: now,
      updated_at: now,
    })

    expect(await db.order_units.count().exec()).toBe(1)

    await expect(
      db.order_units.insert({
        id: crypto.randomUUID(),
        order_id: orderId,
        position: 1,
        item_description: 'Negative',
        price_minor: -1,
        measurements: {},
        fabric_source: 'shop',
        done: false,
        created_at: now,
        updated_at: now,
      }),
    ).rejects.toThrow()
  })

  it('accepts cancelled as an order stage', async () => {
    const db = await freshDatabase()
    const now = new Date().toISOString()

    await db.orders.insert({
      id: crypto.randomUUID(),
      shop_id: crypto.randomUUID(),
      client_id: crypto.randomUUID(),
      order_type: 'tailor_made',
      reference: '1208-K7M2Q',
      currency: 'UGX',
      summary: 'Kanzu +2',
      stage: 'cancelled',
      price_total_minor: 150000,
      price_adjustment_minor: -5000,
      rental_deposit_minor: 0,
      pickup_due_date: '2026-08-12',
      created_at: now,
      updated_at: now,
    })

    expect(await db.orders.count().exec()).toBe(1)
  })

  it('rejects a refund with a non-positive amount', async () => {
    const db = await freshDatabase()

    await expect(
      db.payments.insert({
        id: crypto.randomUUID(),
        order_id: crypto.randomUUID(),
        amount_minor: 0,
        kind: 'refund',
        payment_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
        method: 'cash',
      }),
    ).rejects.toThrow()
  })

  it('declares a migrationStrategies map on every collection', async () => {
    const db = await freshDatabase()
    for (const [name, collection] of Object.entries(db.collections)) {
      expect(
        collection.migrationStrategies,
        `${name} has no migrationStrategies -- a version bump would fail to open ` +
          'the database on devices holding existing data',
      ).toBeDefined()
    }
  })
})

/* Proves the migration plumbing works before anyone needs it. A throwaway
   collection, so it keeps testing the mechanism as real schemas move on. */
describe('schema migration', () => {
  // dev-mode is registered globally by the suite above and refuses a storage
  // without a validator, so this mirrors what createDatabase() builds.
  const open = (name: string) =>
    createRxDatabase({
      name,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageDexie() }),
      multiInstance: false,
    })

  interface WidgetV0 {
    id: string
    label: string
  }
  interface WidgetV1 extends WidgetV0 {
    retired: boolean
  }

  const v0: RxJsonSchema<WidgetV0> = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: { id: { type: 'string', maxLength: 36 }, label: { type: 'string' } },
    required: ['id', 'label'],
  }

  const v1: RxJsonSchema<WidgetV1> = {
    ...v0,
    version: 1,
    properties: { ...v0.properties, retired: { type: 'boolean' } },
    required: ['id', 'label', 'retired'],
  }

  it('carries existing documents across a version bump', async () => {
    const name = `migration_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const before = await open(name)
    await before.addCollections({ widgets: { schema: v0, migrationStrategies: {} } })
    await before.collections.widgets?.insert({ id: 'w1', label: 'Kitenge' })
    await before.close()

    const after = await open(name)
    await after.addCollections({
      widgets: {
        schema: v1,
        migrationStrategies: {
          // The key is the version being migrated *to*.
          1: (doc: WidgetV0) => ({ ...doc, retired: false }),
        },
      },
    })

    const migrated = await after.collections.widgets?.findOne('w1').exec()
    expect(migrated?.toJSON()).toMatchObject({ id: 'w1', label: 'Kitenge', retired: false })

    await after.remove()
  })

  it('fails to open when a version is bumped with no strategy for it', async () => {
    // The exact failure this file exists to keep out of a shop's phone.
    const name = `migration_gap_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const before = await open(name)
    await before.addCollections({ widgets: { schema: v0, migrationStrategies: {} } })
    await before.collections.widgets?.insert({ id: 'w1', label: 'Kitenge' })
    await before.close()

    const after = await open(name)
    await expect(
      after.addCollections({ widgets: { schema: v1, migrationStrategies: {} } }),
    ).rejects.toThrow()

    await after.remove()
  })

  // v0 shape: item_description and a decimal price_total. Pinned here rather
  // than imported so a future edit to schema.ts cannot silently drift it.
  interface OrderDocV0 {
    id: string
    shop_id: string
    client_id: string
    order_type: string
    item_description: string
    stage: string
    price_total: number
    pickup_due_date: string
    return_due_date?: string
    catalogue_item_id?: string
    notes?: string
    created_by?: string
    created_at: string
    updated_at: string
  }

  const ordersSchemaV0: RxJsonSchema<OrderDocV0> = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
      id: { type: 'string', maxLength: 36 },
      shop_id: { type: 'string', maxLength: 36 },
      client_id: { type: 'string', maxLength: 36 },
      order_type: { type: 'string', enum: ['tailor_made', 'rental', 'purchase'] },
      item_description: { type: 'string' },
      stage: {
        type: 'string',
        enum: ['measured', 'in_progress', 'ready', 'picked_up', 'returned'],
        maxLength: 20,
      },
      price_total: { type: 'number', minimum: 0 },
      pickup_due_date: { type: 'string', format: 'date', maxLength: 10 },
      return_due_date: { type: 'string', format: 'date' },
      catalogue_item_id: { type: 'string', maxLength: 36 },
      notes: { type: 'string' },
      created_by: { type: 'string', maxLength: 36 },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
    required: [
      'id',
      'shop_id',
      'client_id',
      'order_type',
      'item_description',
      'stage',
      'price_total',
      'pickup_due_date',
    ],
  }

  it('carries a real v0 order across the money and summary rename', async () => {
    const name = `orders_migration_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const before = await open(name)
    await before.addCollections({
      orders: { schema: ordersSchemaV0, migrationStrategies: {} },
    })
    await before.collections.orders?.insert({
      id: 'o1',
      shop_id: crypto.randomUUID(),
      client_id: crypto.randomUUID(),
      order_type: 'tailor_made',
      item_description: 'Kanzu, navy',
      stage: 'measured',
      price_total: 45000,
      pickup_due_date: '2026-08-12',
      created_at: '2026-08-01T09:00:00.000Z',
      updated_at: '2026-08-01T09:00:00.000Z',
    })
    await before.close()

    const after = await open(name)
    await after.addCollections({ orders: { schema: orderSchema, migrationStrategies: ordersStrategies } })

    const migrated = await after.collections.orders?.findOne('o1').exec()
    expect(migrated?.toJSON()).toMatchObject({
      summary: 'Kanzu, navy',
      price_total_minor: 45000,
      price_adjustment_minor: 0,
      currency: 'UGX',
    })
    expect(migrated?.toJSON()).not.toHaveProperty('price_total')
    // Ties the reference to this order's own created_at (2026-08-01), not
    // today's date -- the DDMM contract the SQL backfill mirrors.
    expect(migrated?.get('reference')).toMatch(/^0108-[0-9A-Z]{5}$/)

    await after.remove()
  })

  // v0 shape: a plain decimal amount, no kind/void trail. Pinned rather than
  // imported for the same reason as ordersSchemaV0.
  interface PaymentDocV0 {
    id: string
    order_id: string
    amount: number
    payment_date: string
    method: string
    recorded_by?: string
    notes?: string
  }

  const paymentsSchemaV0: RxJsonSchema<PaymentDocV0> = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
      id: { type: 'string', maxLength: 36 },
      order_id: { type: 'string', maxLength: 36 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      payment_date: { type: 'string', format: 'date-time' },
      method: { type: 'string', enum: ['cash', 'mobile_money', 'bank', 'other'] },
      recorded_by: { type: 'string', maxLength: 36 },
      notes: { type: 'string' },
    },
    required: ['id', 'order_id', 'amount', 'payment_date', 'method'],
  }

  it('carries a real v0 payment across the amount rename, clamping a sub-unit amount up to 1', async () => {
    const name = `payments_migration_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const before = await open(name)
    await before.addCollections({
      payments: { schema: paymentsSchemaV0, migrationStrategies: {} },
    })
    await before.collections.payments?.insert({
      id: 'p1',
      order_id: crypto.randomUUID(),
      amount: 0.4,
      payment_date: '2026-08-01T09:00:00.000Z',
      method: 'cash',
    })
    await before.close()

    const after = await open(name)
    await after.addCollections({
      payments: { schema: paymentSchema, migrationStrategies: paymentsStrategies },
    })

    const migrated = await after.collections.payments?.findOne('p1').exec()
    expect(migrated?.get('amount_minor')).toBe(1)
    expect(Number.isInteger(migrated?.get('amount_minor'))).toBe(true)
    expect(migrated?.get('amount_minor')).toBeGreaterThan(0)
    expect(migrated?.toJSON()).not.toHaveProperty('amount')

    await after.remove()
  })
})

/** DB6 regression: a v0 shape changed in place stops the database opening. */
describe('sales/expenses v0 -> v1 migration', () => {
  it('converts a v0 sale from major units to minor, adding currency', () => {
    const migrated = saleMigrations[1]({
      id: 's1',
      shop_id: 'shop-1',
      item_description: 'Kitenge shirt',
      quantity: 2,
      unit_price: 40000,
      method: 'cash',
      sold_at: '2026-08-10T10:00:00.000Z',
    })

    expect(migrated).toMatchObject({
      id: 's1',
      quantity: 2,
      unit_price_minor: 40000,
      currency: 'UGX',
    })
    expect(migrated).not.toHaveProperty('unit_price')
    expect(migrated.created_at).toBe('2026-08-10T10:00:00.000Z')
  })

  it('leaves an already-converted sale alone', () => {
    const migrated = saleMigrations[1]({
      id: 's2',
      unit_price_minor: 12345,
      currency: 'KES',
      sold_at: '2026-08-10T10:00:00.000Z',
    })
    expect(migrated.unit_price_minor).toBe(12345)
    expect(migrated.currency).toBe('KES')
  })

  it('converts a v0 expense', () => {
    const migrated = expenseMigrations[1]({
      id: 'e1',
      shop_id: 'shop-1',
      category: 'materials',
      description: 'Fabric',
      amount: 30000,
      spent_on: '2026-08-10',
    })

    expect(migrated).toMatchObject({ amount_minor: 30000, currency: 'UGX' })
    expect(migrated).not.toHaveProperty('amount')
  })

  it('actually opens a database that already holds v0 sales', async () => {
    const name = `db6_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const open = () =>
      createRxDatabase({
        name,
        storage: wrappedValidateAjvStorage({ storage: getRxStorageDexie() }),
        multiInstance: false,
      })

    const v0: RxJsonSchema<Record<string, unknown>> = {
      version: 0,
      primaryKey: 'id',
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 36 },
        shop_id: { type: 'string', maxLength: 36 },
        item_description: { type: 'string' },
        quantity: { type: 'integer', minimum: 1 },
        unit_price: { type: 'number', minimum: 0 },
        method: { type: 'string', enum: ['cash', 'mobile_money', 'bank', 'other'] },
        sold_at: { type: 'string', format: 'date-time', maxLength: 30 },
      },
      required: ['id', 'shop_id', 'item_description', 'quantity', 'unit_price', 'sold_at', 'method'],
      indexes: [['shop_id', 'sold_at']],
    }

    const before = await open()
    await before.addCollections({ sales: { schema: v0, migrationStrategies: {} } })
    await before.collections.sales?.insert({
      id: 'legacy-1',
      shop_id: 'shop-1',
      item_description: 'Legacy shirt',
      quantity: 2,
      unit_price: 40000,
      method: 'cash',
      sold_at: '2026-08-10T10:00:00.000Z',
    })
    await before.close()

    const after = await open()
    await after.addCollections({ sales: { schema: saleSchema, migrationStrategies: saleMigrations } })

    const row = await after.collections.sales?.findOne('legacy-1').exec()
    expect(row?.toJSON()).toMatchObject({
      item_description: 'Legacy shirt',
      quantity: 2,
      unit_price_minor: 40000,
      currency: 'UGX',
    })

    await after.remove()
  })
})
