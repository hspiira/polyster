import type { AppDatabase } from '../../db/database'
import { createShop, createStaff, setFeatureEnabled, updateShop } from '../../db/writes'
import type { BusinessType, FeatureKey, ShopDoc } from '../../db/schema'

export interface SeedTenantInput {
  name: string
  businessType: BusinessType
  ownerName?: string
  featureOverrides?: Partial<Record<FeatureKey, boolean>>
}

/**
 * Creates a shop configured for dev/testing, with an owner staff row -- a
 * shop with no staff is not "provisioned" (see lib/entryState.ts) and the app
 * bounces back to onboarding. One shop per local database.
 */
export async function seedTenant(db: AppDatabase, input: SeedTenantInput): Promise<ShopDoc> {
  const shop = await createShop(db, { name: input.name })
  await updateShop(db, shop.id, { name: shop.name, business_type: input.businessType })
  await createStaff(db, shop.id, { name: input.ownerName ?? 'Owner', role: 'owner' })

  for (const [key, enabled] of Object.entries(input.featureOverrides ?? {})) {
    await setFeatureEnabled(db, shop.id, key as FeatureKey, enabled as boolean)
  }

  const updated = await db.shops.findOne(shop.id).exec()
  if (!updated) throw new Error('Shop vanished immediately after creation.')
  return updated.toJSON()
}
