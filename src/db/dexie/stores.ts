/* Every store on the device. First entry is the primary key, the rest are
   indexes, `[a+b]` is compound. */
export const STORES = {
  // -- the shop and its people ------------------------------------------
  shops: 'id',
  staff: 'id, shop_id',
  tenant_features: 'id, shop_id, [shop_id+feature_key]',

  // -- clients and what they measure ------------------------------------
  clients: 'id, shop_id',
  measurement_fields: 'id, shop_id',
  measurement_profiles: 'id, client_id',

  // -- orders -----------------------------------------------------------
  orders: 'id, shop_id, client_id, created_at, [shop_id+pickup_due_date], [shop_id+stage]',
  order_units: 'id, order_id',
  order_stage_history: 'id, order_id',
  payments: 'id, order_id',

  // -- money ------------------------------------------------------------
  sales: 'id, shop_id, [shop_id+sold_at]',
  expenses: 'id, shop_id, [shop_id+spent_on]',

  // -- messages ---------------------------------------------------------
  message_log: 'id, client_id, order_id',

  events: 'id, [shop_id+at], [entity+entity_id]',

  expense_categories: 'id, shop_id',
  material_types: 'id, shop_id',

  // -- catalogue --------------------------------------------------------
  products: 'id, shop_id, name',
  product_variants: 'id, product_id, sku',
  product_categories: 'id, shop_id, name',
  collections: 'id, shop_id, release_date',

  // -- stock and making -------------------------------------------------
  materials: 'id, shop_id, name',
  suppliers: 'id, shop_id, name',
  inventory_items: 'id, shop_id',
  inventory_movements: 'id, inventory_item_id, created_at',
  production_batches: 'id, shop_id, created_at',
  production_batch_costs: 'id, batch_id',
  garment_units: 'id, shop_id, created_at',
} as const

export type StoreName = keyof typeof STORES

export const STORE_NAMES = Object.keys(STORES) as StoreName[]
