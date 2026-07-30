/**
 * RxDB collection schemas, mirroring the Postgres tables defined in
 * pwa-schema-and-screens.md. Kept in one file at this stage since there
 * are few enough collections to scan at a glance; split up if it grows.
 *
 * Every synced collection carries `_modified` and `_deleted` -- required
 * by RxDB's Supabase replication plugin (confirmed against the installed
 * rxdb package: see DEFAULT_MODIFIED_FIELD / DEFAULT_DELETED_FIELD in
 * rxdb/plugins/replication-supabase). Application code is responsible for
 * setting `_modified` on every write; RxDB does not do this automatically.
 *
 * catalogue_items is intentionally not defined yet -- it's a Phase 2
 * addition per IMPLEMENTATION_PLAN.md.
 */
import type { RxJsonSchema } from 'rxdb'

// Shared building blocks so every collection declares the sync fields the
// same way, rather than retyping them and risking a mismatch.
const syncFields = {
  _modified: { type: 'string' as const },
  _deleted: { type: 'boolean' as const },
}
const syncRequired = ['_modified', '_deleted'] as const

export interface ShopDoc {
  id: string
  name: string
  whatsapp_number: string
  supabase_auth_user_id: string
  created_at: string
  _modified: string
  _deleted: boolean
}
export const shopSchema: RxJsonSchema<ShopDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    name: { type: 'string' },
    whatsapp_number: { type: 'string' },
    supabase_auth_user_id: { type: 'string' },
    created_at: { type: 'string' },
    ...syncFields,
  },
  required: ['id', 'name', ...syncRequired],
}

export interface StaffDoc {
  id: string
  shop_id: string
  name: string
  pin_hash: string
  role: string // 'owner' | 'staff'
  active: boolean
  created_at: string
  _modified: string
  _deleted: boolean
}
export const staffSchema: RxJsonSchema<StaffDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    shop_id: { type: 'string', maxLength: 36 },
    name: { type: 'string' },
    pin_hash: { type: 'string' },
    role: { type: 'string' },
    active: { type: 'boolean' },
    created_at: { type: 'string' },
    ...syncFields,
  },
  required: ['id', 'shop_id', 'name', 'pin_hash', ...syncRequired],
  indexes: ['shop_id'],
}

export interface ClientDoc {
  id: string
  shop_id: string
  name: string
  phone: string
  notes?: string
  created_at: string
  _modified: string
  _deleted: boolean
}
export const clientSchema: RxJsonSchema<ClientDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    shop_id: { type: 'string', maxLength: 36 },
    name: { type: 'string' },
    phone: { type: 'string' },
    notes: { type: 'string' },
    created_at: { type: 'string' },
    ...syncFields,
  },
  required: ['id', 'shop_id', 'name', ...syncRequired],
  indexes: ['shop_id'],
}

export interface MeasurementFieldDoc {
  id: string
  shop_id: string
  label: string
  unit: string
  display_order: number
  _modified: string
  _deleted: boolean
}
export const measurementFieldSchema: RxJsonSchema<MeasurementFieldDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    shop_id: { type: 'string', maxLength: 36 },
    label: { type: 'string' },
    unit: { type: 'string' },
    display_order: { type: 'number' },
    ...syncFields,
  },
  required: ['id', 'shop_id', 'label', ...syncRequired],
  indexes: ['shop_id'],
}

export interface MeasurementProfileDoc {
  id: string
  client_id: string
  values: Record<string, string | number>
  updated_at: string
  updated_by?: string
  _modified: string
  _deleted: boolean
}
export const measurementProfileSchema: RxJsonSchema<MeasurementProfileDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    client_id: { type: 'string', maxLength: 36 },
    values: { type: 'object' },
    updated_at: { type: 'string' },
    updated_by: { type: 'string' },
    ...syncFields,
  },
  required: ['id', 'client_id', ...syncRequired],
  indexes: ['client_id'],
}

export type OrderType = 'tailor_made' | 'rental' | 'purchase'
export type OrderStage = 'measured' | 'in_progress' | 'ready' | 'picked_up' | 'returned'

export interface OrderDoc {
  id: string
  shop_id: string
  client_id: string
  order_type: OrderType
  item_description: string
  stage: OrderStage
  price_total: number
  pickup_due_date: string
  return_due_date?: string
  catalogue_item_id?: string // reserved for Phase 2, not used yet
  notes?: string
  created_by: string
  created_at: string
  updated_at: string
  _modified: string
  _deleted: boolean
}
export const orderSchema: RxJsonSchema<OrderDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    shop_id: { type: 'string', maxLength: 36 },
    client_id: { type: 'string', maxLength: 36 },
    order_type: { type: 'string' },
    item_description: { type: 'string' },
    stage: { type: 'string' },
    price_total: { type: 'number' },
    pickup_due_date: { type: 'string' },
    return_due_date: { type: 'string' },
    catalogue_item_id: { type: 'string', maxLength: 36 },
    notes: { type: 'string' },
    created_by: { type: 'string', maxLength: 36 },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    ...syncFields,
  },
  required: [
    'id',
    'shop_id',
    'client_id',
    'order_type',
    'item_description',
    'stage',
    'price_total',
    'pickup_due_date',
    ...syncRequired,
  ],
  indexes: ['shop_id', 'client_id'],
}

export interface PaymentDoc {
  id: string
  order_id: string
  amount: number
  payment_date: string
  method: string // 'cash' | 'mobile_money' | 'bank' | 'other'
  recorded_by?: string
  notes?: string
  _modified: string
  _deleted: boolean
}
export const paymentSchema: RxJsonSchema<PaymentDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    order_id: { type: 'string', maxLength: 36 },
    amount: { type: 'number' },
    payment_date: { type: 'string' },
    method: { type: 'string' },
    recorded_by: { type: 'string' },
    notes: { type: 'string' },
    ...syncFields,
  },
  required: ['id', 'order_id', 'amount', 'payment_date', 'method', ...syncRequired],
  indexes: ['order_id'],
}

export interface OrderStageHistoryDoc {
  id: string
  order_id: string
  from_stage?: string
  to_stage: string
  changed_by?: string
  changed_at: string
  _modified: string
  _deleted: boolean
}
export const orderStageHistorySchema: RxJsonSchema<OrderStageHistoryDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    order_id: { type: 'string', maxLength: 36 },
    from_stage: { type: 'string' },
    to_stage: { type: 'string' },
    changed_by: { type: 'string' },
    changed_at: { type: 'string' },
    ...syncFields,
  },
  required: ['id', 'order_id', 'to_stage', 'changed_at', ...syncRequired],
  indexes: ['order_id'],
}
