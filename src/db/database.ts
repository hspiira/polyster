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
import {
  shopSchema,
  staffSchema,
  clientSchema,
  measurementFieldSchema,
  measurementProfileSchema,
  orderSchema,
  paymentSchema,
  orderStageHistorySchema,
  type ShopDoc,
  type StaffDoc,
  type ClientDoc,
  type MeasurementFieldDoc,
  type MeasurementProfileDoc,
  type OrderDoc,
  type PaymentDoc,
  type OrderStageHistoryDoc,
} from './schema'

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
}

export type AppDatabase = RxDatabase<Collections>

export const DATABASE_NAME = 'tailor_tracker'

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
    shops: { schema: shopSchema },
    staff: { schema: staffSchema },
    clients: { schema: clientSchema },
    measurement_fields: { schema: measurementFieldSchema },
    measurement_profiles: { schema: measurementProfileSchema },
    orders: { schema: orderSchema },
    payments: { schema: paymentSchema },
    order_stage_history: { schema: orderStageHistorySchema },
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
