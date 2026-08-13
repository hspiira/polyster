import type { AppDatabase } from '../database'
import {
  type PermissionKey,
  type StaffDoc,
  type StaffRole,
} from '../schema'
import { hashPin } from '../../lib/pin'
import { newId, now, loadOrThrow } from './shared'

// ------------------------------------------------------------------ staff

export async function createStaff(
  db: AppDatabase,
  shopId: string,
  input: { name: string; pin?: string; role: StaffRole },
): Promise<StaffDoc> {
  const timestamp = now()
  const doc: StaffDoc = {
    id: newId(),
    shop_id: shopId,
    name: input.name.trim(),
    ...(input.pin ? { pin_hash: await hashPin(input.pin) } : {}),
    role: input.role,
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
  }
  await db.staff.insert(doc)
  return doc
}

export async function setStaffPin(db: AppDatabase, staffId: string, pin: string): Promise<void> {
  const doc = await loadOrThrow(db, 'staff', staffId, 'staff member')
  await doc.patch({ pin_hash: await hashPin(pin), pin_updated_at: now() })
}

/** Removes the lock. The device then opens straight into the shop. */
export async function clearStaffPin(db: AppDatabase, staffId: string): Promise<void> {
  const doc = await loadOrThrow(db, 'staff', staffId, 'staff member')
  await doc.patch({ pin_hash: undefined, pin_updated_at: now() })
}

/* Deactivates rather than deletes: orders point at staff rows, and a departed
   employee's name still has to render on the orders they took. */
export async function setStaffActive(
  db: AppDatabase,
  staffId: string,
  active: boolean,
): Promise<void> {
  const doc = await db.staff.findOne(staffId).exec()
  await doc?.patch({ active })
}

/** Phase 12. Changing role never touches permission_overrides -- those stay
 * whatever they were, layered on top of whichever role is now active. */
export async function setStaffRole(db: AppDatabase, staffId: string, role: StaffRole): Promise<void> {
  const doc = await loadOrThrow(db, 'staff', staffId, 'staff member')
  await doc.patch({ role, updated_at: now() })
}

/** Phase 12. Replaces the whole override set -- the caller sends the full picture, not a delta. */
export async function setStaffPermissionOverrides(
  db: AppDatabase,
  staffId: string,
  overrides: Partial<Record<PermissionKey, boolean>>,
): Promise<void> {
  const doc = await loadOrThrow(db, 'staff', staffId, 'staff member')
  const hasAny = Object.keys(overrides).length > 0
  await doc.patch({
    permission_overrides: hasAny ? overrides : undefined,
    updated_at: now(),
  })
}
