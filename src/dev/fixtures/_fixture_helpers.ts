/* Fixture-only barrel, so the fixture files stay easy to copy while still going
   through the production write abstraction. */
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
} from '../../db/repo'

// `seedTenant` is a fixture-level composition in ./base, not a write helper.
// Re-exporting it from db/repo threw at module load, as a blank page.
export { seedTenant } from './base'

export type { ShopDoc } from '../../db/schema'
export type { PolysterDatabase } from '../../db/dexie/database'
