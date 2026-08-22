/* The order rows may be written in, derived from the foreign keys and checked
   against them by `pnpm verify:schema`. Not the store declaration order. */
import type { SyncedStore } from '../dexie/stores'

export const PUSH_ORDER = [
  'shops',
  'collections',
  'expense_categories',
  'material_types',
  'measurement_fields',
  'product_categories',
  'staff',
  'suppliers',
  'tenant_features',
  'clients',
  'events',
  'expenses',
  'materials',
  'products',
  'measurement_profiles',
  'product_variants',
  'production_batches',
  'sales',
  'garment_units',
  'inventory_items',
  'production_batch_costs',
  'inventory_movements',
  'orders',
  'message_log',
  'order_stage_history',
  'order_units',
  'payments',
] as const satisfies readonly SyncedStore[]

/* Deleting runs the other way, which only matters if a purge ever hard-deletes:
   a parent before its children and the foreign key refuses. */
export const DELETE_ORDER = [...PUSH_ORDER].reverse() as readonly SyncedStore[]
