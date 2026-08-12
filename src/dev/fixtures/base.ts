import type { AppDatabase } from '../../db/database'
import { createShop, createStaff, setFeatureEnabled, updateShop } from '../../db/writes'
import type { BusinessType, FeatureKey, ShopDoc } from '../../db/schema'

export interface SeedTenantInput {
  name: string
  businessType: BusinessType
  ownerName?: string
  ownerPin?: string
  whatsappNumber?: string
  email?: string
  website?: string
  featureOverrides?: Partial<Record<FeatureKey, boolean>>
}

export async function seedTenant(db: AppDatabase, input: SeedTenantInput): Promise<ShopDoc> {
  const shop = await createShop(db, {
    name: input.name,
    whatsapp_number: input.whatsappNumber ?? '+256700000000',
  })
  await updateShop(db, shop.id, {
    name: shop.name,
    whatsapp_number: input.whatsappNumber ?? '+256700000000',
    business_type: input.businessType,
    currency: 'UGX',
    lock_after_minutes: 5,
    timezone: 'Africa/Kampala',
    email: input.email,
    website: input.website,
  })
  await createStaff(db, shop.id, {
    name: input.ownerName ?? 'Owner',
    pin: input.ownerPin ?? '123456',
    role: 'owner',
  })
  for (const [key, enabled] of Object.entries(input.featureOverrides ?? {})) {
    await setFeatureEnabled(db, shop.id, key as FeatureKey, enabled as boolean)
  }

  const updated = await db.shops.findOne(shop.id).exec()
  if (!updated) throw new Error('Shop vanished immediately after creation.')
  return updated.toJSON()
}
