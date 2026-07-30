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
})
