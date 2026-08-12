import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type AppDatabase } from '../../db/database'
import { seedTenant } from './base'

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

describe('seedTenant', () => {
  it('returns the shop with business_type set, not the pre-update snapshot', async () => {
    const db = await freshDatabase()
    const shop = await seedTenant(db, { name: 'Test Shop', businessType: 'apparel_brand' })
    expect(shop.business_type).toBe('apparel_brand')
  })

  it('creates an owner staff row so the shop counts as provisioned', async () => {
    const db = await freshDatabase()
    const shop = await seedTenant(db, { name: 'Test Shop', businessType: 'tailor' })
    const staff = await db.staff.find({ selector: { shop_id: shop.id } }).exec()
    expect(staff).toHaveLength(1)
    expect(staff[0]?.role).toBe('owner')
  })

  it('creates one tenant_features row per override', async () => {
    const db = await freshDatabase()
    const shop = await seedTenant(db, {
      name: 'Test Shop',
      businessType: 'apparel_brand',
      featureOverrides: { catalogue: true, rentals: false },
    })

    const rows = await db.tenant_features.find({ selector: { shop_id: shop.id } }).exec()
    expect(rows.map((r) => [r.feature_key, r.enabled]).sort()).toEqual([
      ['catalogue', true],
      ['rentals', false],
    ])
  })
})
