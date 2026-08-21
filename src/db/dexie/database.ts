/* The on-device database. Opened once and reused; every read and write goes
   through src/db/repo, never through this module directly. */
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

/* Named separately from RxDB's `tailor_tracker` databases so both can exist
   during the import, and a bad release is a code revert rather than a restore. */
export const DATABASE_NAME = 'polyster'

export class PolysterDatabase extends Dexie {
  shops!: EntityTable<ShopDoc, 'id'>
  staff!: EntityTable<StaffDoc, 'id'>
  tenant_features!: EntityTable<TenantFeatureDoc, 'id'>
  clients!: EntityTable<ClientDoc, 'id'>
  measurement_fields!: EntityTable<MeasurementFieldDoc, 'id'>
  measurement_profiles!: EntityTable<MeasurementProfileDoc, 'id'>
  orders!: EntityTable<OrderDoc, 'id'>
  order_units!: EntityTable<OrderUnitDoc, 'id'>
  order_stage_history!: EntityTable<OrderStageHistoryDoc, 'id'>
  payments!: EntityTable<PaymentDoc, 'id'>
  sales!: EntityTable<SaleDoc, 'id'>
  expenses!: EntityTable<ExpenseDoc, 'id'>
  message_log!: EntityTable<MessageLogDoc, 'id'>
  events!: EntityTable<EventDoc, 'id'>
  expense_categories!: EntityTable<ShopTaxonomyDoc, 'id'>
  material_types!: EntityTable<ShopTaxonomyDoc, 'id'>

  products!: EntityTable<Product, 'id'>
  product_variants!: EntityTable<ProductVariant, 'id'>
  product_categories!: EntityTable<ProductCategory, 'id'>
  collections!: EntityTable<Collection, 'id'>
  materials!: EntityTable<Material, 'id'>
  suppliers!: EntityTable<Supplier, 'id'>
  inventory_items!: EntityTable<InventoryItem, 'id'>
  inventory_movements!: EntityTable<InventoryMovement, 'id'>
  production_batches!: EntityTable<ProductionBatch, 'id'>
  production_batch_costs!: EntityTable<ProductionBatchCost, 'id'>
  garment_units!: EntityTable<GarmentUnit, 'id'>

  constructor(name: string = DATABASE_NAME) {
    super(name)
    /* One version, one schema. A later change bumps to version(2) and adds an
       .upgrade() beside it -- there is no per-store version to keep in step. */
    this.version(1).stores(STORES)
  }
}

let instance: PolysterDatabase | null = null

export function getDatabase(): PolysterDatabase {
  instance ??= new PolysterDatabase()
  return instance
}

/** For tests, which need a fresh database per case rather than the singleton. */
export function createDatabase(name: string): PolysterDatabase {
  return new PolysterDatabase(name)
}
