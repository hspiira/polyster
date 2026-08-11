/**
 * RxDB collection schemas, mirroring the Postgres tables.
 *
 * Do not declare `_modified` here: RxDB's dev-mode schema check rejects
 * underscore-prefixed fields other than `_deleted`, so it breaks `pnpm dev`
 * while `vite build` stays green (see database.test.ts). `_modified` and
 * `_deleted` are Postgres/replication-only columns.
 *
 * Nullable Postgres columns are optional here, not a guaranteed type.
 */
import type { RxJsonSchema } from 'rxdb'

const uuidField = { type: 'string' as const, maxLength: 36 }

/** ISO 3166-1 alpha-2. Replaces the hardcoded dialling prefix as the default. */
export const DEFAULT_COUNTRY = 'UG'

/** Affects defaults and navigation only, never a permission boundary. */
export type BusinessType = 'tailor' | 'rental' | 'apparel_brand' | 'corporate_supplier' | 'hybrid'
export const BUSINESS_TYPES: readonly BusinessType[] = [
  'tailor',
  'rental',
  'apparel_brand',
  'corporate_supplier',
  'hybrid',
]

export interface ShopDoc {
  id: string
  name: string
  whatsapp_number?: string
  /** Unset until linked to a live Supabase session; never syncs until then. */
  supabase_auth_user_id?: string
  /** ISO 4217, snapshotted onto each order at creation. */
  currency: string
  country: string
  address?: string
  /** 0 means never. */
  lock_after_minutes: number
  business_type?: BusinessType
  logo_url?: string
  /** IANA zone name, e.g. "Africa/Kampala". Display only. */
  timezone?: string
  email?: string
  website?: string
  created_at: string
  updated_at: string
}
export const shopSchema: RxJsonSchema<ShopDoc> = {
  version: 3, // v3: business_type, logo_url, timezone, email, website
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    name: { type: 'string' },
    whatsapp_number: { type: 'string' },
    supabase_auth_user_id: uuidField,
    currency: { type: 'string' },
    country: { type: 'string' },
    address: { type: 'string' },
    lock_after_minutes: { type: 'integer', minimum: 0 },
    business_type: { type: 'string', enum: [...BUSINESS_TYPES] },
    logo_url: { type: 'string' },
    timezone: { type: 'string' },
    email: { type: 'string' },
    website: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'currency', 'country', 'lock_after_minutes'],
}

// -------------------------------------------------------- tenant features

/** Gates navigation and optional workflows -- never the sole security mechanism. */
export type FeatureKey =
  | 'customers'
  | 'measurements'
  | 'orders'
  | 'payments'
  | 'expenses'
  | 'sales'
  | 'rentals'
  | 'catalogue'
  | 'inventory'
  | 'suppliers'
  | 'production'
  | 'pre_orders'
  | 'corporate_orders'
  | 'collections'
  | 'repairs'
  | 'garment_identity'
  | 'garment_passport'

export const FEATURE_KEYS: readonly FeatureKey[] = [
  'customers',
  'measurements',
  'orders',
  'payments',
  'expenses',
  'sales',
  'rentals',
  'catalogue',
  'inventory',
  'suppliers',
  'production',
  'pre_orders',
  'corporate_orders',
  'collections',
  'repairs',
  'garment_identity',
  'garment_passport',
]

/** Used when a tenant has no override row for a key. */
export const DEFAULT_FEATURE_FLAGS: Record<FeatureKey, boolean> = {
  customers: true,
  measurements: true,
  orders: true,
  payments: true,
  expenses: true,
  sales: true,
  rentals: false,
  catalogue: false,
  inventory: false,
  suppliers: false,
  production: false,
  pre_orders: false,
  corporate_orders: false,
  collections: false,
  repairs: true,
  garment_identity: false,
  garment_passport: false,
}

export interface TenantFeatureDoc {
  id: string
  shop_id: string
  feature_key: FeatureKey
  enabled: boolean
  created_at: string
  updated_at: string
}
export const tenantFeatureSchema: RxJsonSchema<TenantFeatureDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    feature_key: { type: 'string', enum: [...FEATURE_KEYS], maxLength: 20 },
    enabled: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shop_id', 'feature_key', 'enabled'],
  indexes: [['shop_id', 'feature_key']],
}

export type StaffRole = 'owner' | 'staff'

export interface StaffDoc {
  id: string
  shop_id: string
  name: string
  pin_hash?: string
  phone?: string
  /** A PIN reset otherwise leaves no trace. */
  pin_updated_at?: string
  role: StaffRole
  active: boolean
  /** `active` records that someone left, never when. */
  deactivated_at?: string
  created_at: string
  updated_at: string
}
export const staffSchema: RxJsonSchema<StaffDoc> = {
  version: 4, // v4: pin_hash optional -- the PIN is set after registration, not during
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    name: { type: 'string' },
    phone: { type: 'string' },
    pin_hash: { type: 'string' },
    pin_updated_at: { type: 'string', format: 'date-time' },
    role: { type: 'string', enum: ['owner', 'staff'] },
    active: { type: 'boolean' },
    deactivated_at: { type: 'string', format: 'date-time' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shop_id', 'name', 'role', 'active'],
  indexes: ['shop_id'],
}

export interface ClientDoc {
  id: string
  shop_id: string
  name: string
  phone?: string
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}
export const clientSchema: RxJsonSchema<ClientDoc> = {
  version: 1, // v1: created_by, updated_at
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    name: { type: 'string' },
    phone: { type: 'string' },
    notes: { type: 'string' },
    created_by: uuidField,
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shop_id', 'name'],
  indexes: ['shop_id'],
}

export type MeasurementFieldType = 'number' | 'text'
export const MEASUREMENT_FIELD_TYPES: readonly MeasurementFieldType[] = ['number', 'text']

export interface MeasurementFieldDoc {
  id: string
  shop_id: string
  label: string
  unit?: string
  display_order: number
  field_type: MeasurementFieldType
  /** Display grouping only, no logic. */
  group_label?: string
  /** Retiring a field sets this false; `_deleted` returns to meaning deleted. */
  active: boolean
  created_at: string
  updated_at: string
}
export const measurementFieldSchema: RxJsonSchema<MeasurementFieldDoc> = {
  version: 1, // v1: field_type, group_label, active, created_at, updated_at
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    label: { type: 'string' },
    unit: { type: 'string' },
    display_order: { type: 'number' },
    field_type: { type: 'string', enum: [...MEASUREMENT_FIELD_TYPES] },
    group_label: { type: 'string' },
    active: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shop_id', 'label', 'display_order', 'field_type', 'active'],
  indexes: ['shop_id'],
}

export interface MeasurementProfileDoc {
  id: string
  /** One profile per client -- enforced by a unique constraint in Postgres. */
  client_id: string
  values: Record<string, string | number>
  created_at: string
  updated_at: string
  updated_by?: string
}
export const measurementProfileSchema: RxJsonSchema<MeasurementProfileDoc> = {
  version: 1, // v1: created_at
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    client_id: uuidField,
    values: { type: 'object', additionalProperties: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    updated_by: uuidField,
  },
  required: ['id', 'client_id', 'values'],
  indexes: ['client_id'],
}

export type OrderType = 'tailor_made' | 'rental' | 'purchase'
export type OrderStage =
  | 'measured'
  | 'in_progress'
  | 'ready'
  | 'picked_up'
  | 'returned'
  | 'cancelled'

export const ORDER_TYPES: readonly OrderType[] = ['tailor_made', 'rental', 'purchase']
export const ORDER_STAGES: readonly OrderStage[] = [
  'measured',
  'in_progress',
  'ready',
  'picked_up',
  'returned',
  'cancelled',
]

export interface OrderDoc {
  id: string
  shop_id: string
  client_id: string
  order_type: OrderType
  /** DDMM-XXXXX, generated on the device. Indexed, deliberately not unique. */
  reference: string
  /** ISO 4217, snapshotted from the shop at creation. */
  currency: string
  /** Derived from the order's units -- see the model doc's invariant 3. */
  summary: string
  stage: OrderStage
  price_total_minor: number
  /** May be negative: a discount, a late fee, damage. */
  price_adjustment_minor: number
  adjustment_reason?: string
  /** Held and refundable. Never part of price_total_minor or any balance. */
  rental_deposit_minor: number
  deposit_refunded_at?: string
  /** ISO date (YYYY-MM-DD), not a timestamp -- matches the Postgres `date` column. */
  pickup_due_date: string
  return_due_date?: string
  picked_up_at?: string
  returned_at?: string
  cancelled_at?: string
  cancellation_reason?: string
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}
export const orderSchema: RxJsonSchema<OrderDoc> = {
  version: 1, // v1: money in minor units, reference, currency, adjustments, cancellation
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    client_id: uuidField,
    order_type: { type: 'string', enum: [...ORDER_TYPES] },
    reference: { type: 'string' },
    currency: { type: 'string' },
    summary: { type: 'string' },
    stage: { type: 'string', enum: [...ORDER_STAGES], maxLength: 20 },
    price_total_minor: { type: 'integer', minimum: 0 },
    price_adjustment_minor: { type: 'integer' },
    adjustment_reason: { type: 'string' },
    rental_deposit_minor: { type: 'integer', minimum: 0 },
    deposit_refunded_at: { type: 'string', format: 'date-time' },
    pickup_due_date: { type: 'string', format: 'date', maxLength: 10 },
    return_due_date: { type: 'string', format: 'date' },
    picked_up_at: { type: 'string', format: 'date-time' },
    returned_at: { type: 'string', format: 'date-time' },
    cancelled_at: { type: 'string', format: 'date-time' },
    cancellation_reason: { type: 'string' },
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
    'reference',
    'currency',
    'summary',
    'stage',
    'price_total_minor',
    'price_adjustment_minor',
    'rental_deposit_minor',
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

// ------------------------------------------------------------- order units

export type FabricSource = 'client' | 'shop'
export const FABRIC_SOURCES: readonly FabricSource[] = ['client', 'shop']

export interface OrderUnitDoc {
  id: string
  order_id: string
  position: number
  /** Absent means "for the client themselves". Free text by design. */
  wearer_name?: string
  item_description: string
  price_minor: number
  /** Frozen snapshot keyed by measurement_fields.id, never rewritten by a profile edit. */
  measurements: Record<string, string | number>
  fabric_source: FabricSource
  done: boolean
  catalogue_item_id?: string // Phase 2, moved off orders
  photo_url?: string // Phase 2, reserved and unwritten
  notes?: string
  created_at: string
  updated_at: string
}
export const orderUnitSchema: RxJsonSchema<OrderUnitDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    order_id: uuidField,
    position: { type: 'number' },
    wearer_name: { type: 'string' },
    item_description: { type: 'string' },
    price_minor: { type: 'integer', minimum: 0 },
    measurements: { type: 'object', additionalProperties: true },
    fabric_source: { type: 'string', enum: [...FABRIC_SOURCES] },
    done: { type: 'boolean' },
    catalogue_item_id: uuidField,
    photo_url: { type: 'string' },
    notes: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: [
    'id',
    'order_id',
    'position',
    'item_description',
    'price_minor',
    'fabric_source',
    'done',
  ],
  indexes: ['order_id'],
}

// ---------------------------------------------------------------- payments

export type PaymentMethod = 'cash' | 'mobile_money' | 'bank' | 'other'
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'mobile_money', 'bank', 'other']

export type PaymentKind = 'payment' | 'refund'
export const PAYMENT_KINDS: readonly PaymentKind[] = ['payment', 'refund']

export interface PaymentDoc {
  id: string
  order_id: string
  amount_minor: number
  /** A refund is a positive row with kind 'refund', never a negative payment. */
  kind: PaymentKind
  /** When the money moved. */
  payment_date: string
  method: PaymentMethod
  /** Mobile-money transaction id, for statement reconciliation. */
  reference?: string
  recorded_by?: string
  notes?: string
  voided_by?: string
  voided_at?: string
  void_reason?: string
  /** When it was typed in, which offline is not when it moved. */
  created_at: string
}
export const paymentSchema: RxJsonSchema<PaymentDoc> = {
  version: 1, // v1: amount in minor units, kind, created_at, reference, void trail
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    order_id: uuidField,
    // Positive only, for both kinds. A mistaken payment is voided via
    // soft-delete, not by entering a negative correcting row.
    amount_minor: { type: 'integer', exclusiveMinimum: 0 },
    kind: { type: 'string', enum: [...PAYMENT_KINDS] },
    payment_date: { type: 'string', format: 'date-time' },
    method: { type: 'string', enum: [...PAYMENT_METHODS] },
    reference: { type: 'string' },
    recorded_by: uuidField,
    notes: { type: 'string' },
    voided_by: uuidField,
    voided_at: { type: 'string', format: 'date-time' },
    void_reason: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'order_id', 'amount_minor', 'kind', 'payment_date', 'method'],
  indexes: ['order_id'],
}

export interface OrderStageHistoryDoc {
  id: string
  order_id: string
  from_stage?: OrderStage
  to_stage: OrderStage
  /** "Client asked us to hold it." */
  note?: string
  changed_by?: string
  changed_at: string
}
export const orderStageHistorySchema: RxJsonSchema<OrderStageHistoryDoc> = {
  version: 1, // v1: note
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    order_id: uuidField,
    from_stage: { type: 'string', enum: [...ORDER_STAGES] },
    to_stage: { type: 'string', enum: [...ORDER_STAGES] },
    note: { type: 'string' },
    changed_by: uuidField,
    changed_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'order_id', 'to_stage', 'changed_at'],
  indexes: ['order_id'],
}

// ------------------------------------------------------------- message log

export type MessageChannel = 'whatsapp' | 'sms' | 'call'
export const MESSAGE_CHANNELS: readonly MessageChannel[] = ['whatsapp', 'sms', 'call']

export type MessageTemplate = 'stage_update' | 'balance_reminder' | 'custom'
export const MESSAGE_TEMPLATES: readonly MessageTemplate[] = [
  'stage_update',
  'balance_reminder',
  'custom',
]

/**
 * Records intent to send, not delivery. A wa.me link hands off to WhatsApp and
 * the app never learns what happened next.
 */
export interface MessageLogDoc {
  id: string
  client_id: string
  /** Absent when the message is not about an order. */
  order_id?: string
  channel: MessageChannel
  template: MessageTemplate
  /** Recorded alongside the template rather than duplicating the stage enum. */
  order_stage?: OrderStage
  sent_at: string
  sent_by?: string
}
export const messageLogSchema: RxJsonSchema<MessageLogDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    client_id: uuidField,
    order_id: uuidField,
    channel: { type: 'string', enum: [...MESSAGE_CHANNELS] },
    template: { type: 'string', enum: [...MESSAGE_TEMPLATES] },
    order_stage: { type: 'string', enum: [...ORDER_STAGES] },
    sent_at: { type: 'string', format: 'date-time' },
    sent_by: uuidField,
  },
  required: ['id', 'client_id', 'channel', 'template', 'sent_at'],
  // order_id is optional, and Dexie rejects an index on a non-required field.
  indexes: ['client_id'],
}

// ------------------------------------------------------------------- sales

/**
 * A sale: money taken over the counter, now.
 *
 * Deliberately a smaller shape than an order -- no due date, no stages, no
 * units, no balance -- and `client_id` is optional, which is the whole reason
 * this exists rather than reusing `orders`. See 0006_sales_and_expenses.sql
 * for the friction it removes.
 */
export interface SaleDoc {
  id: string
  shop_id: string
  /** Optional. A walk-in customer is not a client record. */
  client_id?: string
  item_description: string
  quantity: number
  /** Denormalised, like orders: a currency change must not rewrite history. */
  currency: string
  /** Price for one unit. Line total is quantity * unit_price_minor. */
  unit_price_minor: number
  method: PaymentMethod
  reference?: string
  /** When the money moved, which offline is not when it was typed in. */
  sold_at: string
  recorded_by?: string
  notes?: string
  voided_by?: string
  voided_at?: string
  void_reason?: string
  created_at: string
  updated_at: string
}
export const saleSchema: RxJsonSchema<SaleDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    client_id: uuidField,
    item_description: { type: 'string' },
    quantity: { type: 'integer', minimum: 1 },
    currency: { type: 'string' },
    // Zero allowed, unlike a payment: a giveaway recorded at zero is more
    // honest than one not recorded at all.
    unit_price_minor: { type: 'integer', minimum: 0 },
    method: { type: 'string', enum: [...PAYMENT_METHODS] },
    reference: { type: 'string' },
    sold_at: { type: 'string', format: 'date-time', maxLength: 30 },
    recorded_by: uuidField,
    notes: { type: 'string' },
    voided_by: uuidField,
    voided_at: { type: 'string', format: 'date-time' },
    void_reason: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: [
    'id',
    'shop_id',
    'item_description',
    'quantity',
    'currency',
    'unit_price_minor',
    'method',
    'sold_at',
  ],
  // Compound: the report always asks for one shop's sales in a date window.
  indexes: [['shop_id', 'sold_at']],
}

// ---------------------------------------------------------------- expenses

export type ExpenseCategory =
  | 'materials'
  | 'rent'
  | 'wages'
  | 'transport'
  | 'utilities'
  | 'other'

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'materials',
  'rent',
  'wages',
  'transport',
  'utilities',
  'other',
]

/**
 * Money out. Without it there is no profit figure, only revenue -- the
 * half-picture 0005's design document flagged and deferred.
 */
export interface ExpenseDoc {
  id: string
  shop_id: string
  category: ExpenseCategory
  description: string
  currency: string
  amount_minor: number
  /** ISO date (YYYY-MM-DD). An expense belongs to a day in the books. */
  spent_on: string
  recorded_by?: string
  notes?: string
  voided_by?: string
  voided_at?: string
  void_reason?: string
  created_at: string
  updated_at: string
}
export const expenseSchema: RxJsonSchema<ExpenseDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    category: { type: 'string', enum: [...EXPENSE_CATEGORIES] },
    description: { type: 'string' },
    currency: { type: 'string' },
    amount_minor: { type: 'integer', exclusiveMinimum: 0 },
    spent_on: { type: 'string', format: 'date', maxLength: 10 },
    recorded_by: uuidField,
    notes: { type: 'string' },
    voided_by: uuidField,
    voided_at: { type: 'string', format: 'date-time' },
    void_reason: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: [
    'id',
    'shop_id',
    'category',
    'description',
    'currency',
    'amount_minor',
    'spent_on',
  ],
  indexes: [['shop_id', 'spent_on']],
}
