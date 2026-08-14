import type { AppDatabase } from '../../db/database'
import type { ShopDoc } from '../../db/schema'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { seedEdgeCaseTenant } from './edge-cases'
import { seedNorthFoundData } from './northfound'
import { seedGenericTailorData } from './tailor'

export interface SeedAllOptions {
  /** Seed even when replication is live, accepting the push to the remote. */
  force?: boolean
}

export interface SeededTenants {
  northFound: ShopDoc
  tailor: ShopDoc
  edgeCases: ShopDoc
}

/* Refuses to run against a configured Supabase: replication is bidirectional,
   so the fixtures would be copied upstream as a second set of tenants. */
export async function seedAll(
  db: AppDatabase,
  options: SeedAllOptions = {},
): Promise<SeededTenants> {
  if (isSupabaseConfigured() && !options.force) {
    throw new Error(
      'Supabase is configured, so replication would push these fixtures upstream and ' +
        'duplicate the tenants already seeded by supabase/seed.sql. Sign in instead: ' +
        'replication pulls that data down on its own. To seed regardless, call ' +
        'seedAll(db, { force: true }).',
    )
  }

  return {
    northFound: await seedNorthFoundData(db),
    tailor: await seedGenericTailorData(db),
    edgeCases: await seedEdgeCaseTenant(db),
  }
}
