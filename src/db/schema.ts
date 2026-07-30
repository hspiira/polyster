/**
 * RxDB collection schemas, mirroring the Postgres tables defined in
 * pwa-schema-and-screens.md.
 *
 * ## Why `_modified` is NOT declared here
 *
 * The Supabase replication protocol uses a `_modified` timestamp column and a
 * `_deleted` soft-delete flag on every synced Postgres table. Neither belongs
 * in the RxDB schema:
 *
 *  - RxDB rejects any top-level field starting with `_` other than `_id` and
 *    `_deleted` (see checkFieldNameRegex / SC8 in rxdb/plugins/dev-mode/
 *    check-schema.js). Declaring `_modified` makes `addCollections()` throw,
 *    but only when the dev-mode plugin is loaded -- so it breaks `pnpm dev`
 *    while a production build appears fine. See the smoke test in
 *    database.test.ts, which exists specifically to catch that asymmetry.
 *  - The replication plugin does not need it. It reads `_modified` off the raw
 *    Postgres row for checkpointing, then strips it, and only copies it back
 *    onto the document if the schema happens to declare that property
 *    (rowToDoc in rxdb/plugins/replication-supabase/index.js).
 *  - `_modified` is server-owned regardless: the migration sets it from a
 *    BEFORE trigger and the plugin deletes it from every pushed row, so client
 *    code could not meaningfully set it even if it wanted to.
 *
 * `_deleted` is likewise omitted. RxDB manages it internally on every document
 * and the replication plugin maps the Postgres column onto it.
 *
 * ## Nullability
 *
 * Fields that are nullable in 0001_init.sql are optional here. Treating a
 * nullable column as a guaranteed `string` is how you get a runtime `null`
 * wearing a `string` type.
 *
 * catalogue_items is intentionally not defined yet -- it's a Phase 2 addition
 * per IMPLEMENTATION_PLAN.md.
 */
import type { RxJsonSchema } from 'rxdb'

// Every id is a Postgres uuid. RxDB requires maxLength on the primary key and
// on any indexed string field, so this is declared once rather than retyped.
const uuidField = { type: 'string' as const, maxLength: 36 }

export interface ShopDoc {
  id: string
  name: string
  whatsapp_number?: string
  supabase_auth_user_id: string
  created_at: string
}
export const shopSchema: RxJsonSchema<ShopDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    name: { type: 'string' },
    whatsapp_number: { type: 'string' },
    supabase_auth_user_id: uuidField,
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'supabase_auth_user_id'],
}

export type StaffRole = 'owner' | 'staff'

export interface StaffDoc {
  id: string
  shop_id: string
  name: string
  pin_hash: string
  role: StaffRole
  active: boolean
  created_at: string
}
export const staffSchema: RxJsonSchema<StaffDoc> = {
  version: 2,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    name: { type: 'string' },
    pin_hash: { type: 'string' },
    role: { type: 'string', enum: ['owner', 'staff'] },
    active: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shop_id', 'name', 'pin_hash', 'role', 'active'],
  indexes: ['shop_id'],
}

export interface ClientDoc {
  id: string
  shop_id: string
  name: string
  phone?: string
  notes?: string
  created_at: string
}
export const clientSchema: RxJsonSchema<ClientDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    name: { type: 'string' },
    phone: { type: 'string' },
    notes: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shop_id', 'name'],
  indexes: ['shop_id'],
}

export interface MeasurementFieldDoc {
  id: string
  shop_id: string
  label: string
  unit?: string
  display_order: number
}
export const measurementFieldSchema: RxJsonSchema<MeasurementFieldDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    label: { type: 'string' },
    unit: { type: 'string' },
    display_order: { type: 'number' },
  },
  required: ['id', 'shop_id', 'label', 'display_order'],
  indexes: ['shop_id'],
}

export interface MeasurementProfileDoc {
  id: string
  /** One profile per client -- enforced by a unique constraint in Postgres. */
  client_id: string
  values: Record<string, string | number>
  updated_at: string
  updated_by?: string
}
export const measurementProfileSchema: RxJsonSchema<MeasurementProfileDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    client_id: uuidField,
    values: { type: 'object', additionalProperties: true },
    updated_at: { type: 'string', format: 'date-time' },
    updated_by: uuidField,
  },
  required: ['id', 'client_id', 'values'],
  indexes: ['client_id'],
}

export type OrderType = 'tailor_made' | 'rental' | 'purchase'
export type OrderStage = 'measured' | 'in_progress' | 'ready' | 'picked_up' | 'returned'

export const ORDER_TYPES: readonly OrderType[] = ['tailor_made', 'rental', 'purchase']
export const ORDER_STAGES: readonly OrderStage[] = [
  'measured',
  'in_progress',
  'ready',
  'picked_up',
  'returned',
]

export interface OrderDoc {
  id: string
  shop_id: string
  client_id: string
  order_type: OrderType
  item_description: string
  stage: OrderStage
  price_total: number
  /** ISO date (YYYY-MM-DD), not a timestamp -- matches the Postgres `date` column. */
  pickup_due_date: string
  return_due_date?: string
  catalogue_item_id?: string // reserved for Phase 2, not used yet
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}
export const orderSchema: RxJsonSchema<OrderDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    client_id: uuidField,
    order_type: { type: 'string', enum: [...ORDER_TYPES] },
    item_description: { type: 'string' },
    stage: { type: 'string', enum: [...ORDER_STAGES], maxLength: 20 },
    price_total: { type: 'number', minimum: 0 },
    pickup_due_date: { type: 'string', format: 'date', maxLength: 10 },
    return_due_date: { type: 'string', format: 'date' },
    catalogue_item_id: uuidField,
    notes: { type: 'string' },
    created_by: uuidField,
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
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
  ],
  // The dashboard's hot queries are "this shop's orders by due date" and
  // "this shop's orders in stage X" -- see IMPLEMENTATION_PLAN.md Phase 1
  // step 7. Compound indexes so those don't full-scan the collection.
  indexes: [
    ['shop_id', 'pickup_due_date'],
    ['shop_id', 'stage'],
    'client_id',
  ],
}

export type PaymentMethod = 'cash' | 'mobile_money' | 'bank' | 'other'
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'mobile_money', 'bank', 'other']

export interface PaymentDoc {
  id: string
  order_id: string
  amount: number
  payment_date: string
  method: PaymentMethod
  recorded_by?: string
  notes?: string
}
export const paymentSchema: RxJsonSchema<PaymentDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    order_id: uuidField,
    // Positive only. A mistaken payment is voided via soft-delete, not by
    // entering a negative correcting row -- see pwa-stack-options.md section 3.
    amount: { type: 'number', exclusiveMinimum: 0 },
    payment_date: { type: 'string', format: 'date-time' },
    method: { type: 'string', enum: [...PAYMENT_METHODS] },
    recorded_by: uuidField,
    notes: { type: 'string' },
  },
  required: ['id', 'order_id', 'amount', 'payment_date', 'method'],
  indexes: ['order_id'],
}

export interface OrderStageHistoryDoc {
  id: string
  order_id: string
  from_stage?: OrderStage
  to_stage: OrderStage
  changed_by?: string
  changed_at: string
}
export const orderStageHistorySchema: RxJsonSchema<OrderStageHistoryDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    order_id: uuidField,
    from_stage: { type: 'string', enum: [...ORDER_STAGES] },
    to_stage: { type: 'string', enum: [...ORDER_STAGES] },
    changed_by: uuidField,
    changed_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'order_id', 'to_stage', 'changed_at'],
  indexes: ['order_id'],
}
