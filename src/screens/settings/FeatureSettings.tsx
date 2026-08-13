import { Card, RowList, Screen, Segmented } from '../../components/ui'
import { useShop } from '../../state/ShopProvider'
import { useFeatureFlags } from '../../hooks/useFeatureFlags'
import { setFeatureEnabled } from '../../db/writes'
import { FEATURE_KEYS, type FeatureKey } from '../../db/schema'
import { useBack } from '../../hooks/useBack'

const FEATURE_LABELS: Record<FeatureKey, string> = {
  customers: 'Customers',
  measurements: 'Measurements',
  orders: 'Orders',
  payments: 'Payments',
  expenses: 'Expenses',
  sales: 'Sales',
  rentals: 'Rentals',
  catalogue: 'Catalogue',
  inventory: 'Inventory',
  suppliers: 'Suppliers',
  production: 'Production',
  pre_orders: 'Pre-orders',
  corporate_orders: 'Corporate orders',
  collections: 'Collections',
  repairs: 'Repairs',
  garment_identity: 'Garment identity',
  garment_passport: 'Garment passport',
}

const TOGGLE_OPTIONS = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
] as const

export function FeatureSettings() {
  const back = useBack()
  const { db, shop } = useShop()
  const flags = useFeatureFlags(db, shop?.id ?? '__none__')

  if (!shop) {
    return (
      <Screen title="Modules" back={back}>
        <Card>
          <p class="text-sm text-content-muted">
            The shop record has not reached this device yet. It arrives with the first sync.
          </p>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen title="Modules" subtitle="What shows up in navigation" back={back}>
      <Card padded={false}>
        <RowList>
          {FEATURE_KEYS.map((key) => (
            <li key={key} class="flex items-center gap-3 px-3 py-2.5">
              <span class="min-w-0 flex-1 font-medium">{FEATURE_LABELS[key]}</span>
              <Segmented
                value={flags[key] ? 'on' : 'off'}
                options={TOGGLE_OPTIONS}
                onChange={(value) => void setFeatureEnabled(db, shop.id, key, value === 'on')}
                label={FEATURE_LABELS[key]}
              />
            </li>
          ))}
        </RowList>
      </Card>
    </Screen>
  )
}
