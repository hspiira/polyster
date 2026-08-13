/* RxDB singleton. Every screen reads and writes through this, never directly
   against Supabase. database.test.ts runs this path with devMode on. */
import { createRxDatabase, addRxPlugin, type RxCollection, type RxDatabase } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema'
import {
  shopSchema,
  staffSchema,
  clientSchema,
  measurementFieldSchema,
  measurementProfileSchema,
  orderSchema,
  paymentSchema,
  orderStageHistorySchema,
  orderUnitSchema,
  saleSchema,
  expenseSchema,
  messageLogSchema,
  tenantFeatureSchema,
  DEFAULT_COUNTRY,
  type ShopDoc,
  type StaffDoc,
  type ClientDoc,
  type MeasurementFieldDoc,
  type MeasurementProfileDoc,
  type OrderDoc,
  type OrderType,
  type OrderStage,
  type PaymentDoc,
  type OrderStageHistoryDoc,
  type OrderUnitDoc,
  type SaleDoc,
  type ExpenseDoc,
  type MessageLogDoc,
  type TenantFeatureDoc,
} from './schema'
import { DEFAULT_CURRENCY, toMinorUnits } from '../lib/money'
import { generateOrderReference } from '../lib/orderReference'
import { DEFAULT_LOCK_AFTER_MINUTES } from '../lib/lockPolicy'
import { backfillOrderUnits } from './backfill'

// Keys must match REPLICATED_TABLES in ./replication.ts.
export type Collections = {
  shops: RxCollection<ShopDoc>
  staff: RxCollection<StaffDoc>
  clients: RxCollection<ClientDoc>
  measurement_fields: RxCollection<MeasurementFieldDoc>
  measurement_profiles: RxCollection<MeasurementProfileDoc>
  orders: RxCollection<OrderDoc>
  payments: RxCollection<PaymentDoc>
  order_stage_history: RxCollection<OrderStageHistoryDoc>
  order_units: RxCollection<OrderUnitDoc>
  sales: RxCollection<SaleDoc>
  expenses: RxCollection<ExpenseDoc>
  message_log: RxCollection<MessageLogDoc>
  tenant_features: RxCollection<TenantFeatureDoc>
}

export type AppDatabase = RxDatabase<Collections>

export const DATABASE_NAME = 'tailor_tracker'

// A version bump with no matching strategy throws on addCollections(), so the
// app can no longer open its own database. Add the strategy in the same commit.
addRxPlugin(RxDBMigrationSchemaPlugin)

// Old document shapes, typed as a Pick of the fields that existed before the
// bump. The new fields are what the matching strategy has to supply.
type ShopDocV1 = Pick<
  ShopDoc,
  'id' | 'name' | 'whatsapp_number' | 'supabase_auth_user_id' | 'created_at'
>
type StaffDocV2 = Pick<
  StaffDoc,
  'id' | 'shop_id' | 'name' | 'pin_hash' | 'role' | 'active' | 'created_at'
>
type ClientDocV0 = Pick<ClientDoc, 'id' | 'shop_id' | 'name' | 'phone' | 'notes' | 'created_at'>
type MeasurementFieldDocV0 = Pick<
  MeasurementFieldDoc,
  'id' | 'shop_id' | 'label' | 'unit' | 'display_order'
>
type MeasurementProfileDocV0 = Pick<
  MeasurementProfileDoc,
  'id' | 'client_id' | 'values' | 'updated_at' | 'updated_by'
>
type OrderStageHistoryDocV0 = Pick<
  OrderStageHistoryDoc,
  'id' | 'order_id' | 'from_stage' | 'to_stage' | 'changed_by' | 'changed_at'
>

// orders pre-v1: money was a decimal, items lived on the order itself, and
// there was no shop-currency snapshot or human-readable reference yet.
interface OrderDocV0 {
  id: string
  shop_id: string
  client_id: string
  order_type: OrderType
  item_description: string
  stage: OrderStage
  price_total: number
  catalogue_item_id?: string
  pickup_due_date: string
  return_due_date?: string
  picked_up_at?: string
  returned_at?: string
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}

// payments pre-v1: a plain decimal amount, no kind/void trail, and no
// created_at distinct from payment_date.
interface PaymentDocV0 {
  id: string
  order_id: string
  amount: number
  payment_date: string
  method: PaymentDoc['method']
  recorded_by?: string
  notes?: string
}

/** Exported so a test can exercise the strategy RxDB actually ships with. */
export const ordersStrategies = {
  1: (doc: OrderDocV0): OrderDoc => {
    const { item_description, price_total, catalogue_item_id: _catalogue_item_id, ...rest } = doc
    return {
      ...rest,
      summary: item_description,
      price_total_minor: Math.round(price_total),
      price_adjustment_minor: 0,
      rental_deposit_minor: 0,
      currency: DEFAULT_CURRENCY,
      reference: generateOrderReference(new Date(doc.created_at ?? Date.now())),
    }
  },
  // v2 added customer_type, organisation_name, purchase_order_reference,
  // contact_person and four ids -- all optional, no shape change.
  2: (doc: OrderDoc) => doc,
  // v3 widened order_type/stage to include 'repair' values and added
  // garment_unit_id (optional) -- no shape change for existing documents.
  3: (doc: OrderDoc) => doc,
}

/** Exported so a test can exercise the strategy RxDB actually ships with. */
export const paymentsStrategies = {
  1: (doc: PaymentDocV0): PaymentDoc => {
    const { amount, ...rest } = doc
    return {
      ...rest,
      // Mirrors the `round(amount)::bigint <= 0` pre-flight in migration 0005.
      // Clamps rather than rejects: refusing would brick the only local copy.
      amount_minor: Math.max(1, Math.round(amount)),
      kind: 'payment',
      created_at: doc.payment_date,
    }
  },
}

/* v0 -> v1: `unit_price` in major units became `unit_price_minor`. Converted,
   not dropped. DEFAULT_CURRENCY is safe: v0 only ever reached dev machines. */
export const saleMigrations = {
  1: (doc: Record<string, unknown>) => {
    const { unit_price: unitPrice, ...rest } = doc as { unit_price?: number }
    const currency = (doc.currency as string) ?? DEFAULT_CURRENCY
    const timestamp = (doc.sold_at as string) ?? new Date().toISOString()
    return {
      ...rest,
      currency,
      unit_price_minor:
        (doc.unit_price_minor as number) ?? toMinorUnits(unitPrice ?? 0, currency),
      created_at: (doc.created_at as string) ?? timestamp,
      updated_at: (doc.updated_at as string) ?? timestamp,
    }
  },
  // v2 only widened sold_at's maxLength. No stored value changes.
  2: (doc: Record<string, unknown>) => doc,
}

/** v0 -> v1: `amount` in major units became `amount_minor`, plus currency. */
export const expenseMigrations = {
  1: (doc: Record<string, unknown>) => {
    const { amount, ...rest } = doc as { amount?: number }
    const currency = (doc.currency as string) ?? DEFAULT_CURRENCY
    const timestamp = new Date().toISOString()
    return {
      ...rest,
      currency,
      amount_minor: (doc.amount_minor as number) ?? toMinorUnits(amount ?? 0, currency),
      created_at: (doc.created_at as string) ?? timestamp,
      updated_at: (doc.updated_at as string) ?? timestamp,
    }
  },
}

let dbPromise: Promise<AppDatabase> | null = null

/* Builds the database. Exported for tests, which need a fresh instance under a
   throwaway name; application code should use `getDatabase()`. */
export async function createDatabase(
  options: { name?: string; devMode?: boolean } = {},
): Promise<AppDatabase> {
  const { name = DATABASE_NAME, devMode = import.meta.env.DEV } = options

  let storage = getRxStorageDexie()

  // `import.meta.env.DEV` must be the outer condition: Rollup only tree-shakes
  // the dynamic imports for a statically known constant, not a runtime param.
  if (import.meta.env.DEV && devMode) {
    const { RxDBDevModePlugin, disableWarnings } = await import('rxdb/plugins/dev-mode')
    const { wrappedValidateAjvStorage } = await import('rxdb/plugins/validate-ajv')
    addRxPlugin(RxDBDevModePlugin)
    disableWarnings()
    storage = wrappedValidateAjvStorage({ storage }) as typeof storage
  }

  const db = await createRxDatabase<Collections>({
    name,
    storage,
    // Multiple tabs are not expected usage, but this is what lets replication
    // elect one leader tab. Without it, two tabs both push to Supabase.
    multiInstance: true,
    eventReduce: true,
    ignoreDuplicate: devMode,
  })

  await db.addCollections({
    shops: {
      schema: shopSchema,
      migrationStrategies: {
        // v1 just relaxed `required` (supabase_auth_user_id is now optional); no shape change.
        1: (doc) => doc,
        // v2 added currency, country, address, lock_after_minutes, updated_at.
        // lock_after_minutes matches migration 0005 -- 0 means never, not unset.
        2: (doc: ShopDocV1): ShopDoc => ({
          ...doc,
          currency: DEFAULT_CURRENCY,
          country: DEFAULT_COUNTRY,
          lock_after_minutes: DEFAULT_LOCK_AFTER_MINUTES,
          updated_at: doc.created_at,
        }),
        // v3 added business_type, logo_url, timezone, email, website (all optional).
        3: (doc: ShopDoc) => doc,
      },
    },
    staff: {
      schema: staffSchema,
      migrationStrategies: {
        // v1 added pin_length so the PIN pad could tell when a variable-length
        // PIN was complete.
        1: (doc: StaffDoc) => doc,
        // v2 removed it: PINs are fixed at six digits, a constant not data.
        // Dropping it keeps stored documents matching the schema for ajv.
        2: (doc: StaffDoc & { pin_length?: number }) => {
          const { pin_length: _removed, ...rest } = doc
          return rest
        },
        // v3 added phone, pin_updated_at, deactivated_at (all optional) and updated_at.
        3: (doc: StaffDocV2): StaffDoc => ({ ...doc, updated_at: doc.created_at }),
        // v4 only relaxed `required`: pin_hash is now optional. No shape change.
        4: (doc: StaffDoc) => doc,
        // v5 widened role to include 'manager' and added permission_overrides
        // (optional) -- no existing document's role or shape is affected.
        5: (doc: StaffDoc) => doc,
      },
    },
    clients: {
      schema: clientSchema,
      migrationStrategies: {
        // v1 added created_by (optional) and updated_at.
        1: (doc: ClientDocV0): ClientDoc => ({ ...doc, updated_at: doc.created_at }),
      },
    },
    measurement_fields: {
      schema: measurementFieldSchema,
      migrationStrategies: {
        // v1 added field_type, group_label (optional), active, created_at, updated_at.
        1: (doc: MeasurementFieldDocV0): MeasurementFieldDoc => {
          const now = new Date().toISOString()
          return { ...doc, field_type: 'number', active: true, created_at: now, updated_at: now }
        },
      },
    },
    measurement_profiles: {
      schema: measurementProfileSchema,
      migrationStrategies: {
        // v1 added created_at; updated_at already existed and is the best stand-in.
        1: (doc: MeasurementProfileDocV0): MeasurementProfileDoc => ({
          ...doc,
          created_at: doc.updated_at,
        }),
      },
    },
    orders: { schema: orderSchema, migrationStrategies: ordersStrategies },
    payments: { schema: paymentSchema, migrationStrategies: paymentsStrategies },
    order_stage_history: {
      schema: orderStageHistorySchema,
      migrationStrategies: {
        // v1 added note, which is optional -- no value to backfill.
        1: (doc: OrderStageHistoryDocV0): OrderStageHistoryDoc => doc,
        // v2 added repair stages to the from_stage/to_stage enum; existing
        // rows already satisfy it since their values are a subset.
        2: (doc: OrderStageHistoryDoc): OrderStageHistoryDoc => doc,
      },
    },
    order_units: { schema: orderUnitSchema, migrationStrategies: {} },
    sales: { schema: saleSchema, migrationStrategies: saleMigrations },
    expenses: { schema: expenseSchema, migrationStrategies: expenseMigrations },
    message_log: {
      schema: messageLogSchema,
      migrationStrategies: {
        // v1 widened an enum; existing values are a subset. Identity, but it
        // must exist -- a bump with no strategy is COL12.
        1: (doc: MessageLogDoc) => doc,
      },
    },
    tenant_features: { schema: tenantFeatureSchema, migrationStrategies: {} },
  })

  try {
    await backfillOrderUnits(db)
  } catch (error) {
    // A repair failure must never stop a shop's phone from opening the
    // database holding its only copy of the day's work.
    console.error('[db] backfillOrderUnits failed:', error)
  }

  return db
}

/* Returns the shared RxDB instance, creating it on first call. Safe from
   multiple components -- they all get the same one. */
export function getDatabase(): Promise<AppDatabase> {
  if (!dbPromise) {
    dbPromise = createDatabase().catch((err) => {
      // Reset so a later caller can retry rather than being handed a
      // permanently rejected promise.
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

/* Destroys every local collection. Always presented as destructive: the local
   copy is the only copy until it syncs. Callers must reload afterwards. */
export async function wipeLocalDatabase(db: AppDatabase): Promise<void> {
  await db.remove()
  dbPromise = null
}
