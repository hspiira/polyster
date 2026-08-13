import { useCurrentShop } from '../state/ShopProvider'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import { usePermission } from '../hooks/usePermission'
import type { ScreenSection } from '../ui'
import type { FeatureKey } from '../db/schema'

const SECTIONS: readonly (ScreenSection & { feature: FeatureKey | null })[] = [
  { href: '/money', label: 'Overview', feature: null },
  { href: '/sales', label: 'Sales', feature: 'sales' },
  { href: '/expenses', label: 'Expenses', feature: 'expenses' },
  { href: '/reports', label: 'Reports', feature: null },
]

/** The money area's screens, for the title menu on each of them. */
export function useMoneySections(): ScreenSection[] {
  const { db, shop } = useCurrentShop()
  const flags = useFeatureFlags(db, shop.id)
  const canViewReports = usePermission('reports.view')

  return SECTIONS.filter((section) => {
    if (section.feature && !flags[section.feature]) return false
    if (section.href === '/reports' && !canViewReports) return false
    return true
  }).map(({ href, label }) => ({ href, label }))
}
