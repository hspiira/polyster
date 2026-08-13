/* Which modules exist for this shop, grouped because seventeen flat switches is
   a list nobody finishes. OTHER catches any key not placed in a group. */
import {
  Card,
  RowList,
  Screen,
  SectionTitle,
  SettingRow,
  Switch,
} from '../../ui'
import {
  IconBox,
  IconFactory,
  IconLayers,
  IconMoney,
  IconOrders,
  IconReceipt,
  IconRepeat,
  IconRuler,
  IconPreOrder,
  IconCorporate,
  IconSale,
  IconRepair,
  IconGarment,
  IconPassport,
  IconTag,
  IconTruck,
  IconUsers,
  type IconComponent,
} from '../../components/icons'
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

const FEATURE_ICONS: Record<FeatureKey, IconComponent> = {
  customers: IconUsers,
  measurements: IconRuler,
  orders: IconOrders,
  payments: IconMoney,
  expenses: IconReceipt,
  sales: IconSale,
  rentals: IconRepeat,
  catalogue: IconTag,
  inventory: IconBox,
  suppliers: IconTruck,
  production: IconFactory,
  pre_orders: IconPreOrder,
  corporate_orders: IconCorporate,
  collections: IconLayers,
  repairs: IconRepair,
  garment_identity: IconGarment,
  garment_passport: IconPassport,
}

const GROUPS: readonly { title: string; keys: readonly FeatureKey[] }[] = [
  { title: 'The basics', keys: ['customers', 'measurements', 'orders', 'payments'] },
  { title: 'Money', keys: ['sales', 'expenses'] },
  {
    title: 'Selling',
    keys: ['catalogue', 'collections', 'rentals', 'pre_orders', 'corporate_orders'],
  },
  { title: 'Making and stock', keys: ['production', 'inventory', 'suppliers', 'repairs'] },
  { title: 'Garments', keys: ['garment_identity', 'garment_passport'] },
]

const GROUPED = new Set(GROUPS.flatMap((group) => group.keys))
const UNGROUPED = FEATURE_KEYS.filter((key) => !GROUPED.has(key))

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

  const shopId = shop.id
  const groups = UNGROUPED.length > 0 ? [...GROUPS, { title: 'Other', keys: UNGROUPED }] : GROUPS

  return (
    <Screen title="Modules" back={back} width="wide">
      <div class="grid grid-cols-[repeat(auto-fit,minmax(19rem,1fr))] items-start gap-section">
        {groups.map((group) => (
          <section key={group.title}>
            <SectionTitle>{group.title}</SectionTitle>
            <Card padded={false}>
              <RowList>
                {group.keys.map((key) => {
                  const Icon = FEATURE_ICONS[key]
                  return (
                    <li key={key}>
                      <SettingRow
                        icon={<Icon size={18} />}
                        label={FEATURE_LABELS[key]}
                        tone={flags[key] ? 'accent' : 'neutral'}
                        trailing={
                          <Switch
                            checked={flags[key]}
                            label={FEATURE_LABELS[key]}
                            onChange={(next) => void setFeatureEnabled(db, shopId, key, next)}
                          />
                        }
                      />
                    </li>
                  )
                })}
              </RowList>
            </Card>
          </section>
        ))}
      </div>
    </Screen>
  )
}
