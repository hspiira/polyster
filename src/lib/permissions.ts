/* Granular permissions (Phase 12, §11, §83). Advisory only: the shop is one
   Supabase user, so RLS has no per-staff identity to enforce these against. */
import type { PermissionKey, StaffDoc, StaffRole } from '../db/schema'
import { PERMISSION_KEYS } from '../db/schema'

type PermissionSet = Record<PermissionKey, boolean>

function allOf(value: boolean): PermissionSet {
  return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, value])) as PermissionSet
}

export const ROLE_DEFAULT_PERMISSIONS: Record<StaffRole, PermissionSet> = {
  owner: allOf(true),
  manager: { ...allOf(true), 'payments.refund': false },
  staff: {
    ...allOf(false),
    'orders.create': true,
    'payments.create': true,
    'inventory.view': true,
    'reports.view': true,
  },
}

/* Null staff -- nobody picked yet, or no staff at all -- is allowed everything.
   Same reasoning `isLocked()` uses for a shop with no PINs set. */
export function hasPermission(
  staff: Pick<StaffDoc, 'role' | 'permission_overrides'> | null | undefined,
  key: PermissionKey,
): boolean {
  if (!staff) return true
  const override = staff.permission_overrides?.[key]
  if (override !== undefined) return override
  return ROLE_DEFAULT_PERMISSIONS[staff.role][key]
}
