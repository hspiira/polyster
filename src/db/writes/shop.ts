import type { AppDatabase } from '../database'
import {
  DEFAULT_COUNTRY,
  type BusinessType,
  type FeatureKey,
  type ShopDoc,
  type TenantFeatureDoc,
} from '../schema'
import { DEFAULT_CURRENCY } from '../../lib/money'
import { DEFAULT_LOCK_AFTER_MINUTES } from '../../lib/lockPolicy'
import { newId, now } from './shared'

// ------------------------------------------------------------------- shop

/** Creates a shop locally, online or offline. See ARCHITECTURE.md D14. */
export async function createShop(
  db: AppDatabase,
  input: { name: string; whatsapp_number?: string; supabaseAuthUserId?: string },
): Promise<ShopDoc> {
  const timestamp = now()
  const doc: ShopDoc = {
    id: newId(),
    name: input.name.trim(),
    whatsapp_number: input.whatsapp_number?.trim() || undefined,
    supabase_auth_user_id: input.supabaseAuthUserId,
    currency: DEFAULT_CURRENCY,
    country: DEFAULT_COUNTRY,
    lock_after_minutes: DEFAULT_LOCK_AFTER_MINUTES,
    created_at: timestamp,
    updated_at: timestamp,
  }
  await db.shops.insert(doc)
  return doc
}

export async function updateShop(
  db: AppDatabase,
  shopId: string,
  input: {
    name?: string
    whatsapp_number?: string
    currency?: string
    lock_after_minutes?: number
    business_type?: BusinessType
    logo_url?: string
    timezone?: string
    email?: string
    website?: string
  },
): Promise<void> {
  const doc = await db.shops.findOne(shopId).exec()
  if (!doc) throw new Error('Shop record not found on this device.')

  const patch: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new Error('The shop needs a name -- it appears on every message you send.')
    patch.name = name
  }

  for (const key of ['whatsapp_number', 'logo_url', 'timezone', 'email', 'website'] as const) {
    const value = input[key]
    if (value !== undefined) patch[key] = value.trim() || undefined
  }

  if (input.currency !== undefined) patch.currency = input.currency
  if (input.lock_after_minutes !== undefined) patch.lock_after_minutes = input.lock_after_minutes
  if (input.business_type !== undefined) patch.business_type = input.business_type

  await doc.patch(patch)
}

/* Attaches a verified account to a shop set up without one. Refuses if it
   already belongs to another: overwriting is how you sync into someone else's shop. */
export async function claimShop(
  db: AppDatabase,
  shopId: string,
  supabaseAuthUserId: string,
): Promise<void> {
  const doc = await db.shops.findOne(shopId).exec()
  if (!doc) throw new Error('Shop record not found on this device.')

  const existing = doc.get('supabase_auth_user_id') as string | undefined
  if (existing && existing !== supabaseAuthUserId) {
    throw new Error('This shop is already backed up under a different number.')
  }

  await doc.patch({ supabase_auth_user_id: supabaseAuthUserId })
}

// -------------------------------------------------------- tenant features

/** Creates the override row on first toggle; patches it after that. */
export async function setFeatureEnabled(
  db: AppDatabase,
  shopId: string,
  featureKey: FeatureKey,
  enabled: boolean,
): Promise<void> {
  const existing = await db.tenant_features
    .findOne({ selector: { shop_id: shopId, feature_key: featureKey } })
    .exec()

  if (existing) {
    await existing.patch({ enabled, updated_at: now() })
    return
  }

  const timestamp = now()
  const doc: TenantFeatureDoc = {
    id: newId(),
    shop_id: shopId,
    feature_key: featureKey,
    enabled,
    created_at: timestamp,
    updated_at: timestamp,
  }
  await db.tenant_features.insert(doc)
}
