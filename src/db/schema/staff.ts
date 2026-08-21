
export const STAFF_ROLES = ['owner', 'manager', 'staff'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

/** Phase 12's own list (section 11) -- the "future permissions" it names explicitly. */
export const PERMISSION_KEYS = [
  'orders.create',
  'orders.edit',
  'orders.cancel',
  'payments.create',
  'payments.refund',
  'inventory.view',
  'inventory.adjust',
  'production.manage',
  'expenses.create',
  'reports.view',
] as const
export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export interface StaffDoc {
  id: string
  shop_id: string
  name: string
  pin_hash?: string
  phone?: string
  /** A PIN reset otherwise leaves no trace. */
  pin_updated_at?: string
  role: StaffRole
  /* Per-person exceptions to the role defaults. Absent means "use the role
     default", which is most staff. */
  permission_overrides?: Partial<Record<PermissionKey, boolean>>
  active: boolean
  /** `active` records that someone left, never when. */
  deactivated_at?: string
  created_at: string
  updated_at: string
}
