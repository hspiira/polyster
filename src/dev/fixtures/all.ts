import type { PolysterDatabase } from '../../db/dexie/database'
import type { ShopDoc } from '../../db/schema'
import { seedEdgeCaseTenant } from './edge-cases'
import { seedNorthFoundData } from './northfound'
import { seedGenericTailorData } from './tailor'

export interface SeededTenants {
  northFound: ShopDoc
  tailor: ShopDoc
  edgeCases: ShopDoc
}

/** Seeds all three fixture tenants into one database. */
export async function seedAll(db: PolysterDatabase): Promise<SeededTenants> {
  return {
    northFound: await seedNorthFoundData(db),
    tailor: await seedGenericTailorData(db),
    edgeCases: await seedEdgeCaseTenant(db),
  }
}
