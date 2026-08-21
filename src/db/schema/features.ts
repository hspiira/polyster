
// -------------------------------------------------------- tenant features

/** Gates navigation and optional workflows -- never the sole security mechanism. */
export const FEATURE_KEYS = [
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
] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

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

/** Phase 12 (section 11, 83): 'manager' sits between the original two. */
