import { describe, expect, it } from 'vitest'
import { resolveFeatureFlags } from './features'
import { DEFAULT_FEATURE_FLAGS } from './schema'

describe('resolveFeatureFlags', () => {
  it('returns the defaults when there are no overrides', () => {
    expect(resolveFeatureFlags([])).toEqual(DEFAULT_FEATURE_FLAGS)
  })

  it('applies an override on top of the defaults', () => {
    const resolved = resolveFeatureFlags([{ feature_key: 'catalogue', enabled: true }])
    expect(resolved.catalogue).toBe(true)
    expect(resolved.customers).toBe(true)
    expect(resolved.rentals).toBe(false)
  })

  it('lets a later override for the same key win', () => {
    const resolved = resolveFeatureFlags([
      { feature_key: 'sales', enabled: false },
      { feature_key: 'sales', enabled: true },
    ])
    expect(resolved.sales).toBe(true)
  })
})
