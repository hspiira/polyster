import type { AppDatabase } from '../../db/database'
import { seedTenant } from './base'

/** Baseline tenant: default feature flags already match this persona. */
export function seedGenericTailor(db: AppDatabase) {
  return seedTenant(db, { name: 'Generic Tailor', businessType: 'tailor' })
}
