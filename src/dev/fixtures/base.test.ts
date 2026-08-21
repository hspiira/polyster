import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type PolysterDatabase } from '../../db/dexie/database'
import { listBy } from '../../db/repo'
import { seedTenant } from './base'

const opened: PolysterDatabase[] = []
let counter = 0

function freshDatabase(): PolysterDatabase {
  const db = createDatabase(`fixture_base_${++counter}`)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
})

describe('seedTenant', () => {
  it('returns the shop with business_type set, not the pre-update snapshot', async () => {
    const db = freshDatabase()
    const shop = await seedTenant(db, { name: 'Test Shop', businessType: 'apparel_brand' })
    expect(shop.business_type).toBe('apparel_brand')
  })

  it('creates an owner staff row so the shop counts as provisioned', async () => {
    const db = freshDatabase()
    const shop = await seedTenant(db, { name: 'Test Shop', businessType: 'tailor' })
    const staff = await listBy(db.staff, 'shop_id', shop.id)
    expect(staff).toHaveLength(1)
    expect(staff[0]?.role).toBe('owner')
  })

  it('creates one tenant_features row per override', async () => {
    const db = freshDatabase()
    const shop = await seedTenant(db, {
      name: 'Test Shop',
      businessType: 'apparel_brand',
      featureOverrides: { catalogue: true, rentals: false },
    })

    const rows = await listBy(db.tenant_features, 'shop_id', shop.id)
    expect(rows.map((r) => [r.feature_key, r.enabled]).sort()).toEqual([
      ['catalogue', true],
      ['rentals', false],
    ])
  })
})
