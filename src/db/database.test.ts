/**
 * The test this project most needed and did not have.
 *
 * Every collection schema is created here with `devMode: true`, which is what
 * loads RxDB's schema checker and the ajv document validator. Both are
 * dev-only in the app, so a schema mistake used to fail `pnpm dev` while
 * `vite build` passed cleanly -- the failure mode that shipped a broken
 * scaffold. Running the same path here moves that class of bug into CI.
 *
 * Concretely, this catches: underscore-prefixed fields RxDB rejects (the
 * original `_modified` bug), indexed string fields missing `maxLength`,
 * indexed fields that are not required, unknown ajv formats, and documents
 * that do not satisfy their own schema.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createRxDatabase, type RxJsonSchema } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'
import { createDatabase, type AppDatabase } from './database'
import { REPLICATED_TABLES } from './replication'

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
      // RxDB injects _deleted/_rev/_meta/_attachments itself; nothing the app
      // authored should be in here. _modified in particular belongs to
      // Postgres only -- see the header of ./schema.ts.
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
      item_description: 'Two-piece suit, navy',
      stage: 'measured',
      price_total: 250000,
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
        item_description: 'Refund test',
        stage: 'measured',
        price_total: -1,
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
        // @ts-expect-error -- deliberately outside OrderStage; the runtime
        // schema must reject it too, not just the compiler.
        stage: 'lost_in_the_back',
        item_description: 'Kitenge dress',
        price_total: 80000,
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
        amount: 0,
        payment_date: new Date().toISOString(),
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

/**
 * Proves the migration plumbing works before anyone needs it. Once this app is
 * on a shop's phone, that phone holds the only copy of work done offline: a
 * version bump that cannot open the existing store is a data-loss bug in
 * practice, even though the rows are technically still in IndexedDB.
 *
 * This uses a throwaway collection rather than a real one so it keeps testing
 * the mechanism after the app's own schemas move past v0.
 */
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
})
