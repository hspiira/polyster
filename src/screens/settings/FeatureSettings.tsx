/**
 * Which modules exist for this shop.
 *
 * Seventeen switches in one flat card is a list nobody reads to the end, so
 * they are grouped by the part of the business they belong to. `OTHER` is the
 * safety net: a key added to FEATURE_KEYS without being placed in a group still
 * appears, rather than silently vanishing from the only screen that controls it.
 */
import {
  Card,
  InfoNote,
  RowList,
  Screen,
  SectionTitle,
  SettingRow,
  Switch,
} from '../../ui'
import {
  IconBox,
  IconFactory,
  IconFingerprint,
  IconLayers,
  IconMoney,
  IconOrders,
  IconReceipt,
  IconRepeat,
  IconRuler,
  IconScissors,
  IconSpool,
  IconTag,
  IconTruck,
  IconUsers,
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

const FEATURE_ICONS: Record<FeatureKey, (props: { size?: number }) => preact.JSX.Element> = {
  customers: IconUsers,
  measurements: IconRuler,
  orders: IconOrders,
  payments: IconMoney,
  expenses: IconReceipt,
  sales: IconMoney,
  rentals: IconRepeat,
  catalogue: IconTag,
  inventory: IconBox,
  suppliers: IconTruck,
  production: IconFactory,
  pre_orders: IconOrders,
  corporate_orders: IconOrders,
  collections: IconLayers,
  repairs: IconScissors,
  garment_identity: IconFingerprint,
  garment_passport: IconSpool,
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

      <div class="mt-section">
        <InfoNote>
          Turning a module off hides it from navigation. Nothing already recorded through it is
          deleted, and turning it back on brings the data back into view.
        </InfoNote>
      </div>
    </Screen>
  )
}
