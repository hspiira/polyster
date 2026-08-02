/**
 * RxDB database singleton. Every screen reads and writes through this --
 * never directly against Supabase (see ARCHITECTURE.md section 3,
 * "Data flow").
 *
 * The dev-mode + ajv-validation wiring below runs only in development. That
 * asymmetry is deliberate (both plugins are large and their checks are
 * developer aids, not runtime requirements) but it has a sharp edge: a schema
 * mistake fails loudly in `pnpm dev` and silently passes `vite build`. The
 * smoke test in database.test.ts runs this exact code path with dev-mode on so
 * the failure surfaces in CI rather than on someone's laptop.
 */
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
  messageLogSchema,
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
  type MessageLogDoc,
} from './schema'
import { DEFAULT_CURRENCY } from '../lib/money'
import { generateOrderReference } from '../lib/orderReference'
import { DEFAULT_LOCK_AFTER_MINUTES } from '../lib/lockPolicy'

// Collections keyed exactly as the Supabase tableName they replicate
// against (see REPLICATED_TABLES in ./replication.ts) -- keep these in sync.
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
  message_log: RxCollection<MessageLogDoc>
}

export type AppDatabase = RxDatabase<Collections>

export const DATABASE_NAME = 'tailor_tracker'

/**
 * Schema migrations.
 *
 * Every collection passes a `migrationStrategies` map, empty while all schemas
 * are still at `version: 0`. The empty maps are not decoration -- they are the
 * pattern being established while it is free.
 *
 * The failure this prevents is specific and bad. Once this app is installed on
 * a shop's phone, that phone holds the only copy of any work done offline.
 * Bumping a schema version without a strategy for the version below it makes
 * `addCollections()` throw on that device, and the app cannot open the
 * database that holds the shop's orders. It is not a data-loss bug on paper --
 * the rows are still in IndexedDB -- but it is one in practice, because the
 * only thing that can read them is the app that now refuses to start.
 *
 * So: when you bump a `version` in schema.ts, add the matching strategy here
 * in the same commit. A strategy is a function from the old document shape to
 * the new one; returning `null` drops the document.
 *
 *     orders: {
 *       schema: orderSchema,           // version: 1
 *       migrationStrategies: {
 *         1: (doc) => ({ ...doc, deposit_required: false }),
 *       },
 *     }
 *
 * The number is the version being migrated *to*. Test it: `database.test.ts`
 * has a case that opens a collection at v0, writes a document, reopens it at
 * v1, and asserts the document survived.
 */
addRxPlugin(RxDBMigrationSchemaPlugin)

// Old document shapes, one per migrated collection, typed as a `Pick` of the
// fields that already existed before the bump -- the new fields are exactly
// the ones the matching strategy below has to supply.
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
      reference: generateOrderReference(new Date(doc.created_at)),
    }
  },
}

let dbPromise: Promise<AppDatabase> | null = null

/**
 * Builds the database. Exported for tests, which need a fresh instance under a
 * throwaway name; application code should use `getDatabase()`.
 */
export async function createDatabase(
  options: { name?: string; devMode?: boolean } = {},
): Promise<AppDatabase> {
  const { name = DATABASE_NAME, devMode = import.meta.env.DEV } = options

  let storage = getRxStorageDexie()

  // `import.meta.env.DEV` has to be the outer condition, not `devMode`.
  // Rollup only drops the two dynamic imports below -- roughly 240 KB, which
  // would otherwise land in the service worker's precache manifest and be
  // downloaded by every install -- if the guard is a statically known
  // constant. A parameter is not. The consequence is that dev-mode cannot be
  // switched on in a production build at all, which is the right trade for an
  // app whose users are on metered, low-bandwidth connections.
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
    // Multiple tabs are not the expected usage (one shop device, staff picker
    // inside the app), but leaving this on costs nothing and is what lets the
    // replication plugin elect a single leader tab if a second one is ever
    // opened -- without it, two tabs would both push to Supabase.
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
        // v2 added currency, country, address (optional), lock_after_minutes, updated_at.
        // lock_after_minutes matches the server backfill (0005_order_units_and_schema_pass.sql)
        // and DEFAULT_LOCK_AFTER_MINUTES -- 0 would mean "never lock", not "unset".
        2: (doc: ShopDocV1): ShopDoc => ({
          ...doc,
          currency: DEFAULT_CURRENCY,
          country: DEFAULT_COUNTRY,
          lock_after_minutes: DEFAULT_LOCK_AFTER_MINUTES,
          updated_at: doc.created_at,
        }),
      },
    },
    staff: {
      schema: staffSchema,
      migrationStrategies: {
        // v1 added pin_length so the PIN pad could tell when a variable-length
        // PIN was complete.
        1: (doc: StaffDoc) => doc,
        // v2 removed it again: PINs are now fixed at six digits, so the length
        // is a constant in the app rather than data. Dropping the field here
        // keeps stored documents matching the schema -- ajv would reject them
        // otherwise, and only in dev, which is the asymmetry this project has
        // already been bitten by once.
        2: (doc: StaffDoc & { pin_length?: number }) => {
          const { pin_length: _removed, ...rest } = doc
          return rest
        },
        // v3 added phone, pin_updated_at, deactivated_at (all optional) and updated_at.
        3: (doc: StaffDocV2): StaffDoc => ({ ...doc, updated_at: doc.created_at }),
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
    payments: {
      schema: paymentSchema,
      migrationStrategies: {
        // v1: amount -> amount_minor, plus kind and a created_at distinct from payment_date.
        1: (doc: PaymentDocV0): PaymentDoc => {
          const { amount, ...rest } = doc
          return {
            ...rest,
            amount_minor: Math.round(amount),
            kind: 'payment',
            created_at: doc.payment_date,
          }
        },
      },
    },
    order_stage_history: {
      schema: orderStageHistorySchema,
      migrationStrategies: {
        // v1 added note, which is optional -- no value to backfill.
        1: (doc: OrderStageHistoryDocV0): OrderStageHistoryDoc => doc,
      },
    },
    order_units: { schema: orderUnitSchema, migrationStrategies: {} },
    message_log: { schema: messageLogSchema, migrationStrategies: {} },
  })

  return db
}

/**
 * Returns the single shared RxDB instance, creating it on first call.
 * Safe to call from multiple components -- they all get the same instance.
 */
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

/**
 * Destroys every local collection.
 *
 * For handing a device on, and for the one recovery path that has nothing to
 * verify against. A shop's local copy is the only copy until it syncs, so this
 * is always presented as destructive. Callers reload afterwards -- the cached
 * promise above would otherwise hand out a removed database.
 */
export async function wipeLocalDatabase(db: AppDatabase): Promise<void> {
  await db.remove()
  dbPromise = null
}
