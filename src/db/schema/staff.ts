import type { RxJsonSchema } from 'rxdb'
import { idField } from './shared'

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
export const staffSchema: RxJsonSchema<StaffDoc> = {
  version: 5, // v5: role gains 'manager', permission_overrides (Phase 12)
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: idField,
    shop_id: idField,
    name: { type: 'string' },
    phone: { type: 'string' },
    pin_hash: { type: 'string' },
    pin_updated_at: { type: 'string', format: 'date-time' },
    role: { type: 'string', enum: [...STAFF_ROLES] },
    permission_overrides: { type: 'object', additionalProperties: true },
    active: { type: 'boolean' },
    deactivated_at: { type: 'string', format: 'date-time' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shop_id', 'name', 'role', 'active'],
  indexes: ['shop_id'],
}
