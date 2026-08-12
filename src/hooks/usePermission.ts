import { useShop } from '../state/ShopProvider'
import { hasPermission } from '../lib/permissions'
import type { PermissionKey } from '../db/schema'

/** Whether the currently active staff member may do something (Phase 12). */
export function usePermission(key: PermissionKey): boolean {
  const { activeStaff } = useShop()
  return hasPermission(activeStaff, key)
}
