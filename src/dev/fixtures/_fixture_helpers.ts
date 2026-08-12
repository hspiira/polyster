/**
 * Small fixture-only barrel.
 *
 * Keeping these imports in one place makes the fixture files easy to copy into
 * the repository while preserving the existing production write abstraction.
 */
export {
  changeOrderStage,
  createClient,
  createMeasurementField,
  createOrder,
  createStaff,
  logMessage,
  recordExpense,
  recordPayment,
  recordSale,
  saveMeasurements,
  setFeatureEnabled,
} from '../../db/writes'

// Not a write helper: `seedTenant` is a fixture-level composition that lives in
// ./base. Re-exporting it from db/writes threw "does not provide an export
// named 'seedTenant'" at module load, and because main.tsx imports this barrel
// dynamically in dev, that surfaced as a blank page rather than an error.
export { seedTenant } from './base'

export type { ShopDoc } from '../../db/schema'
export type { AppDatabase } from '../../db/database'
