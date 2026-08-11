import type { AppDatabase } from '../db/database'
import { observeFeatureFlags } from '../db/features'
import { DEFAULT_FEATURE_FLAGS, type FeatureKey } from '../db/schema'
import { useRxQuery } from './useRxQuery'

/** Live, resolved feature flags for a shop -- defaults until the first emit. */
export function useFeatureFlags(db: AppDatabase, shopId: string): Record<FeatureKey, boolean> {
  return useRxQuery(() => observeFeatureFlags(db, shopId), [db, shopId], DEFAULT_FEATURE_FLAGS)
}
