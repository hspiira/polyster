/* The on-device database. Read and write through src/db/repo, not this. */
import Dexie, { type EntityTable } from 'dexie'
import { STORES } from './stores'
import type {
  ClientDoc,
  Collection,
  EventDoc,
  GarmentUnit,
  InventoryItem,
  InventoryMovement,
  Material,
  ExpenseDoc,
  MeasurementFieldDoc,
  MeasurementProfileDoc,
  MessageLogDoc,
  OrderDoc,
  OrderStageHistoryDoc,
  OrderUnitDoc,
  PaymentDoc,
  Product,
  ProductCategory,
  ProductVariant,
  ProductionBatch,
  ProductionBatchCost,
  SaleDoc,
  ShopDoc,
  ShopTaxonomyDoc,
  StaffDoc,
  Supplier,
  TenantFeatureDoc,
} from '../schema'

export const DATABASE_NAME = 'polyster'

/** A stored row, which may be soft-deleted. */
export type Stored<T> = T & { deleted_at?: string }

export class PolysterDatabase extends Dexie {
  shops!: EntityTable<Stored<ShopDoc>, 'id'>
  staff!: EntityTable<Stored<StaffDoc>, 'id'>
  tenant_features!: EntityTable<Stored<TenantFeatureDoc>, 'id'>
  clients!: EntityTable<Stored<ClientDoc>, 'id'>
  measurement_fields!: EntityTable<Stored<MeasurementFieldDoc>, 'id'>
  measurement_profiles!: EntityTable<Stored<MeasurementProfileDoc>, 'id'>
  orders!: EntityTable<Stored<OrderDoc>, 'id'>
  order_units!: EntityTable<Stored<OrderUnitDoc>, 'id'>
  order_stage_history!: EntityTable<Stored<OrderStageHistoryDoc>, 'id'>
  payments!: EntityTable<Stored<PaymentDoc>, 'id'>
  sales!: EntityTable<Stored<SaleDoc>, 'id'>
  expenses!: EntityTable<Stored<ExpenseDoc>, 'id'>
  message_log!: EntityTable<Stored<MessageLogDoc>, 'id'>
  events!: EntityTable<Stored<EventDoc>, 'id'>
  expense_categories!: EntityTable<Stored<ShopTaxonomyDoc>, 'id'>
  material_types!: EntityTable<Stored<ShopTaxonomyDoc>, 'id'>

  products!: EntityTable<Stored<Product>, 'id'>
  product_variants!: EntityTable<Stored<ProductVariant>, 'id'>
  product_categories!: EntityTable<Stored<ProductCategory>, 'id'>
  collections!: EntityTable<Stored<Collection>, 'id'>
  materials!: EntityTable<Stored<Material>, 'id'>
  suppliers!: EntityTable<Stored<Supplier>, 'id'>
  inventory_items!: EntityTable<Stored<InventoryItem>, 'id'>
  inventory_movements!: EntityTable<Stored<InventoryMovement>, 'id'>
  production_batches!: EntityTable<Stored<ProductionBatch>, 'id'>
  production_batch_costs!: EntityTable<Stored<ProductionBatchCost>, 'id'>
  garment_units!: EntityTable<Stored<GarmentUnit>, 'id'>

  constructor(name: string = DATABASE_NAME) {
    super(name)
    this.version(1).stores(STORES)
  }
}

let instance: PolysterDatabase | null = null

export function getDatabase(): PolysterDatabase {
  instance ??= new PolysterDatabase()
  return instance
}

/** A named database, for tests that need one per case. */
export function createDatabase(name: string): PolysterDatabase {
  return new PolysterDatabase(name)
}

/* Deletes every store on the device. Always presented as destructive: the local
   copy is the only copy until it is backed up. Callers must reload afterwards. */
export async function wipeLocalDatabase(db: PolysterDatabase): Promise<void> {
  db.close()
  await db.delete()
  if (instance === db) instance = null
}
