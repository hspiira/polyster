import type { AppDatabase } from '../../db/database'
import { seedTenant } from './base'

/** Advanced tenant persona -- see docs/POLYSTER.md section 84. */
export function seedNorthFound(db: AppDatabase) {
  return seedTenant(db, {
    name: 'NORTH//FOUND',
    businessType: 'apparel_brand',
    featureOverrides: {
      catalogue: true,
      inventory: true,
      suppliers: true,
      production: true,
      pre_orders: true,
      corporate_orders: true,
      collections: true,
      garment_identity: true,
      garment_passport: true,
    },
  })
}
