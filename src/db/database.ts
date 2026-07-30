/**
 * RxDB database singleton. Every screen reads and writes through this --
 * never directly against Supabase (see ARCHITECTURE.md section 3,
 * "Data flow").
 *
 * The dev-mode + ajv-validation wiring below is copied from the usage
 * example in RxDB's own `createRxDatabase` type declaration (rxdb ^17.4.0,
 * see node_modules/rxdb/dist/types/rx-database.d.ts) rather than guessed,
 * since getting this wrong fails silently in production builds.
 */
import { createRxDatabase, addRxPlugin, type RxDatabase } from 'rxdb'
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
// against (see wireReplication in ./replication.ts) -- keep these in sync.
type Collections = {
  shops: import('rxdb').RxCollection<ShopDoc>
  staff: import('rxdb').RxCollection<StaffDoc>
  clients: import('rxdb').RxCollection<ClientDoc>
  measurement_fields: import('rxdb').RxCollection<MeasurementFieldDoc>
  measurement_profiles: import('rxdb').RxCollection<MeasurementProfileDoc>
  orders: import('rxdb').RxCollection<OrderDoc>
  payments: import('rxdb').RxCollection<PaymentDoc>
  order_stage_history: import('rxdb').RxCollection<OrderStageHistoryDoc>
}

let dbPromise: Promise<RxDatabase<Collections>> | null = null

async function createDatabase(): Promise<RxDatabase<Collections>> {
  let storage = getRxStorageDexie()

  if (import.meta.env.DEV) {
    // Dev-only: schema validation + readable error messages. Both plugins
    // are tree-shaken out of production builds because this branch never
    // runs there -- see the RxDB example this is based on.
    const { RxDBDevModePlugin } = await import('rxdb/plugins/dev-mode')
    const { wrappedValidateAjvStorage } = await import('rxdb/plugins/validate-ajv')
    addRxPlugin(RxDBDevModePlugin)
    storage = wrappedValidateAjvStorage({ storage }) as typeof storage
  }

  const db = await createRxDatabase<Collections>({
    name: 'tailor_tracker',
    storage,
    // Single browser tab per device in this app's real-world usage
    // (one shop device, staff picker inside the app rather than multiple
    // tabs) -- revisit if that assumption stops holding.
    multiInstance: true,
    eventReduce: true,
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
export function getDatabase(): Promise<RxDatabase<Collections>> {
  if (!dbPromise) {
    dbPromise = createDatabase()
  }
  return dbPromise
}
