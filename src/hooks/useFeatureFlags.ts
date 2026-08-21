import type { PolysterDatabase } from '../db/dexie/database'
import { observeFeatureFlags } from '../db/repo'
import { DEFAULT_FEATURE_FLAGS, type FeatureKey } from '../db/schema'
import { useQuery } from './useQuery'

/** Live, resolved feature flags for a shop -- defaults until the first emit. */
export function useFeatureFlags(db: PolysterDatabase, shopId: string): Record<FeatureKey, boolean> {
  return useQuery(() => observeFeatureFlags(db, shopId), [db, shopId], DEFAULT_FEATURE_FLAGS)
}
