import type { PolysterDatabase, Stored } from '../dexie/database'
import {
  DEFAULT_COUNTRY,
  DEFAULT_FEATURE_FLAGS,
  type BusinessType,
  type FeatureKey,
  type PermissionKey,
  type ShopDoc,
  type StaffDoc,
  type StaffRole,
  type TenantFeatureDoc,
} from '../schema'
import { DEFAULT_CURRENCY } from '../../lib/money'
import { DEFAULT_LOCK_AFTER_MINUTES } from '../../lib/lockPolicy'
import { hashPin } from '../../lib/pin'
import { newId } from '../../lib/ids'
import {
  insertRow,
  liveQuery,
  listBy,
  now,
  observeAll,
  observeBy,
  observeRow,
  patchRow,
  type Observable,
} from './base'

// ------------------------------------------------------------------- shop

/** Every shop on the device. There is normally exactly one. */
export function observeShops(db: PolysterDatabase): Observable<Stored<ShopDoc>[]> {
  return observeAll(db.shops)
}

export function observeShop(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<ShopDoc> | null> {
  return observeRow(db.shops, shopId)
}

/** Creates a shop locally, online or offline. See ARCHITECTURE.md D14. */
export async function createShop(
  db: PolysterDatabase,
  input: { name: string; whatsapp_number?: string; supabaseAuthUserId?: string },
): Promise<ShopDoc> {
  const timestamp = now()
  const doc: ShopDoc = {
    id: newId(),
    name: input.name.trim(),
    currency: DEFAULT_CURRENCY,
    country: DEFAULT_COUNTRY,
    lock_after_minutes: DEFAULT_LOCK_AFTER_MINUTES,
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.whatsapp_number?.trim() ? { whatsapp_number: input.whatsapp_number.trim() } : {}),
    ...(input.supabaseAuthUserId ? { supabase_auth_user_id: input.supabaseAuthUserId } : {}),
  }
  return insertRow(db.shops, doc, doc.id, doc.name)
}

export interface ShopInput {
  name?: string
  whatsapp_number?: string
  currency?: string
  lock_after_minutes?: number
  business_type?: BusinessType
  logo_url?: string
  timezone?: string
  email?: string
  website?: string
}

const TRIMMED = ['whatsapp_number', 'logo_url', 'timezone', 'email', 'website'] as const

export async function updateShop(
  db: PolysterDatabase,
  shopId: string,
  input: ShopInput,
): Promise<void> {
  const changes: Partial<Stored<ShopDoc>> = { updated_at: now() }

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new Error('The shop needs a name -- it appears on every message you send.')
    changes.name = name
  }

  for (const key of TRIMMED) {
    const value = input[key]
    if (value !== undefined) changes[key] = value.trim() || undefined
  }

  if (input.currency !== undefined) changes.currency = input.currency
  if (input.lock_after_minutes !== undefined) changes.lock_after_minutes = input.lock_after_minutes
  if (input.business_type !== undefined) changes.business_type = input.business_type

  await patchRow(db.shops, shopId, changes, { label: 'shop', shopId })
}

/* Attaches a verified account to a shop set up without one. Refuses if it
   already belongs to another: overwriting is how you sync into someone else's shop. */
export async function claimShop(
  db: PolysterDatabase,
  shopId: string,
  supabaseAuthUserId: string,
): Promise<void> {
  const shop = await db.shops.get(shopId)
  if (!shop) throw new Error('Shop record not found on this device.')

  if (shop.supabase_auth_user_id && shop.supabase_auth_user_id !== supabaseAuthUserId) {
    throw new Error('This shop is already backed up under a different number.')
  }

  await patchRow(
    db.shops,
    shopId,
    { supabase_auth_user_id: supabaseAuthUserId, updated_at: now() },
    { label: 'shop', shopId },
  )
}

// ------------------------------------------------------------------ staff

/** The people who can unlock this device, by name. */
export function observeActiveStaff(db: PolysterDatabase): Observable<Stored<StaffDoc>[]> {
  return liveQuery(async () => {
    const all = await db.staff.toArray()
    return all
      .filter((row) => !row.deleted_at && row.active)
      .sort((a, b) => a.name.localeCompare(b.name))
  })
}

/** Everyone on the books, active or not, by name. */
export function observeStaff(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<StaffDoc>[]> {
  return observeBy(db.staff, 'shop_id', shopId, { key: 'name' })
}

export async function createStaff(
  db: PolysterDatabase,
  shopId: string,
  input: { name: string; pin?: string; role: StaffRole },
): Promise<StaffDoc> {
  const timestamp = now()
  const doc: StaffDoc = {
    id: newId(),
    shop_id: shopId,
    name: input.name.trim(),
    role: input.role,
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.pin ? { pin_hash: await hashPin(input.pin) } : {}),
  }
  return insertRow(db.staff, doc, shopId, doc.name)
}

export async function setStaffPin(
  db: PolysterDatabase,
  staffId: string,
  pin: string,
): Promise<void> {
  await patch(db, staffId, { pin_hash: await hashPin(pin), pin_updated_at: now() })
}

/** Removes the lock. The device then opens straight into the shop. */
export async function clearStaffPin(db: PolysterDatabase, staffId: string): Promise<void> {
  await patch(db, staffId, { pin_hash: undefined, pin_updated_at: now() })
}

/* Deactivates rather than deletes: orders point at staff rows, and a departed
   employee's name still has to render on the orders they took. */
export async function setStaffActive(
  db: PolysterDatabase,
  staffId: string,
  active: boolean,
): Promise<void> {
  if (!(await db.staff.get(staffId))) return
  await patch(db, staffId, { active })
}

/** Changing role never touches permission_overrides -- those layer on top of it. */
export async function setStaffRole(
  db: PolysterDatabase,
  staffId: string,
  role: StaffRole,
): Promise<void> {
  await patch(db, staffId, { role })
}

/** Replaces the whole override set -- the caller sends the full picture, not a delta. */
export async function setStaffPermissionOverrides(
  db: PolysterDatabase,
  staffId: string,
  overrides: Partial<Record<PermissionKey, boolean>>,
): Promise<void> {
  const hasAny = Object.keys(overrides).length > 0
  await patch(db, staffId, { permission_overrides: hasAny ? overrides : undefined })
}

function patch(
  db: PolysterDatabase,
  staffId: string,
  changes: Partial<Stored<StaffDoc>>,
): Promise<Stored<StaffDoc>> {
  return patchRow(
    db.staff,
    staffId,
    { ...changes, updated_at: now() },
    { label: 'staff member' },
  )
}

// -------------------------------------------------------- tenant features

export function resolveFeatureFlags(
  overrides: readonly Pick<TenantFeatureDoc, 'feature_key' | 'enabled'>[],
): Record<FeatureKey, boolean> {
  const resolved = { ...DEFAULT_FEATURE_FLAGS }
  for (const row of overrides) {
    resolved[row.feature_key] = row.enabled
  }
  return resolved
}

export function observeFeatureFlags(
  db: PolysterDatabase,
  shopId: string,
): Observable<Record<FeatureKey, boolean>> {
  return liveQuery(async () =>
    resolveFeatureFlags(await listBy(db.tenant_features, 'shop_id', shopId)),
  )
}

/** Creates the override row on first toggle; patches it after that. */
export async function setFeatureEnabled(
  db: PolysterDatabase,
  shopId: string,
  featureKey: FeatureKey,
  enabled: boolean,
): Promise<void> {
  const existing = (await listBy(db.tenant_features, 'shop_id', shopId)).find(
    (row) => row.feature_key === featureKey,
  )

  if (existing) {
    await patchRow(db.tenant_features, existing.id, { enabled, updated_at: now() }, { shopId })
    return
  }

  const timestamp = now()
  await insertRow(
    db.tenant_features,
    {
      id: newId(),
      shop_id: shopId,
      feature_key: featureKey,
      enabled,
      created_at: timestamp,
      updated_at: timestamp,
    },
    shopId,
    featureKey,
  )
}
