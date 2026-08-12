import { map, type Observable } from 'rxjs'
import type { AppDatabase } from './database'
import { DEFAULT_FEATURE_FLAGS, type FeatureKey, type TenantFeatureDoc } from './schema'

export function resolveFeatureFlags(
  overrides: readonly Pick<TenantFeatureDoc, 'feature_key' | 'enabled'>[],
): Record<FeatureKey, boolean> {
  const resolved = { ...DEFAULT_FEATURE_FLAGS }
  for (const row of overrides) {
    resolved[row.feature_key] = row.enabled
  }
  return resolved
}

export function observeFeatureFlags(
  db: AppDatabase,
  shopId: string,
): Observable<Record<FeatureKey, boolean>> {
  return db.tenant_features.find({ selector: { shop_id: shopId } }).$.pipe(
    map((docs) => resolveFeatureFlags(docs.map((doc) => doc.toJSON()))),
  )
}
