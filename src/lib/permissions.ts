/**
 * Granular permissions (Phase 12, sections 11 and 83).
 *
 * Advisory, not a security boundary -- same as the PIN itself (see
 * StaffSettings.tsx's own note). Nothing here is enforced server-side: the
 * shop authenticates as one Supabase user for the whole device (ARCHITECTURE.md
 * section 4), so RLS has no per-staff-member identity to check. What this
 * gates is the UI a staff member sees after picking their own name, exactly
 * the same trust level attribution already has -- someone who knows another
 * person's PIN could already act as them before this existed, and still can.
 *
 * Role defaults, not mandated by the spec (section 11 lists the keys, not
 * which role gets which), chosen as a judgment call:
 *   - owner: everything.
 *   - manager: everything except payments.refund -- reversing money that
 *     already moved is the one action reserved to the owner by default.
 *   - staff: the day-to-day actions (taking an order, taking a payment,
 *     checking stock and reports), not the ones that change history or cost
 *     the shop money (editing/cancelling an order, refunding, adjusting
 *     stock, running production, logging an expense).
 * Every default can be overridden per person in permission_overrides.
 */
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

/**
 * Whether the given staff member may do something. `null` staff (no one has
 * been picked yet, or the device has no staff at all) is allowed everything
 * -- there is nothing to restrict against, the same reasoning `isLocked()`
 * uses for a shop with no PINs set.
 */
export function hasPermission(
  staff: Pick<StaffDoc, 'role' | 'permission_overrides'> | null | undefined,
  key: PermissionKey,
): boolean {
  if (!staff) return true
  const override = staff.permission_overrides?.[key]
  if (override !== undefined) return override
  return ROLE_DEFAULT_PERMISSIONS[staff.role][key]
}
