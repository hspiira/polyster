/**
 * Settings: how the app behaves, and nothing else.
 *
 * Sales, expenses and reports used to sit in this list. They are the day's work,
 * not configuration, and they now live behind the Money tab.
 *
 * Grouped rather than one long list. On a phone a flat card of seven rows is a
 * wall you have to read end to end; a labelled group is something you can skip.
 */
import {
  Button,
  Card,
  ListRow,
  RowList,
  Screen,
  SectionTitle,
  InfoNote,
} from '../components/ui'
import {
  IconBox,
  IconDownload,
  IconFactory,
  IconFingerprint,
  IconLayers,
  IconLock,
  IconRuler,
  IconSettings,
  IconSpool,
  IconTag,
  IconToggle,
  IconTruck,
  IconUsers,
} from '../components/icons'
import { ThemeChoice } from '../components/ThemeChoice'
import { useShop } from '../state/ShopProvider'
import { useAuth } from '../hooks/useAuth'
import { useFeatureFlags } from '../hooks/useFeatureFlags'

interface Entry {
  href: string
  label: string
  hint: string
  Icon: (props: { size?: number }) => preact.JSX.Element
}

const SHOP_ENTRIES: readonly Entry[] = [
  {
    href: '/settings/shop',
    label: 'Shop details',
    hint: 'Name and WhatsApp number',
    Icon: IconSettings,
  },
  {
    href: '/settings/measurements',
    label: 'Measurement fields',
    hint: 'What you record for each client',
    Icon: IconRuler,
  },
  {
    href: '/settings/staff',
    label: 'Staff',
    hint: 'Who can use this app',
    Icon: IconUsers,
  },
  {
    href: '/catalogue',
    label: 'Catalogue',
    hint: 'Products, categories and variants',
    Icon: IconTag,
  },
  {
    href: '/collections',
    label: 'Collections',
    hint: 'Releases, with their own story and cover image',
    Icon: IconLayers,
  },
  {
    href: '/suppliers',
    label: 'Suppliers',
    hint: 'Who supplies fabric, trims and outsourced work',
    Icon: IconTruck,
  },
  {
    href: '/materials',
    label: 'Materials',
    hint: 'Fabric, thread, buttons and what is on hand',
    Icon: IconSpool,
  },
  {
    href: '/inventory',
    label: 'Inventory',
    hint: 'Stock levels and movement history',
    Icon: IconBox,
  },
  {
    href: '/production',
    label: 'Production',
    hint: 'Batches, quality control and costing',
    Icon: IconFactory,
  },
  {
    href: '/garment-units',
    label: 'Garment identity',
    hint: 'Individual garments, their serial numbers and status',
    Icon: IconFingerprint,
  },
  {
    href: '/settings/features',
    label: 'Modules',
    hint: 'What shows up in navigation',
    Icon: IconToggle,
  },
]

const DEVICE_ENTRIES: readonly Entry[] = [
  {
    href: '/settings/lock',
    label: 'Lock this phone',
    hint: 'Ask for a PIN before opening the shop',
    Icon: IconLock,
  },
  {
    href: '/settings/backup',
    label: 'Backup',
    hint: 'Download a copy of everything',
    Icon: IconDownload,
  },
]

export function Settings() {
  const { db, shop, activeStaff, setActiveStaff } = useShop()
  const { controller } = useAuth()
  const flags = useFeatureFlags(db, shop?.id ?? '__none__')

  const shopEntries = SHOP_ENTRIES.filter((entry) => {
    if (entry.href === '/settings/measurements') return flags.measurements
    if (entry.href === '/catalogue') return flags.catalogue
    if (entry.href === '/collections') return flags.collections
    if (entry.href === '/suppliers' || entry.href === '/materials') return flags.suppliers
    if (entry.href === '/inventory') return flags.inventory
    if (entry.href === '/production') return flags.production
    if (entry.href === '/garment-units') return flags.garment_identity
    return true
  })

  return (
    <Screen title="Settings" subtitle={shop?.name} back="/">
      <div class="space-y-6">
        <Group title="Your shop" entries={shopEntries} />
        <Group title="This device" entries={DEVICE_ENTRIES} />

        <section>
          <SectionTitle>Appearance</SectionTitle>
          <ThemeChoice />
        </section>

        {activeStaff && (
          <section>
            <SectionTitle>Working as</SectionTitle>
            <Card>
              <p class="text-sm text-content-muted">
                Orders you take are recorded against{' '}
                <span class="font-medium text-content">{activeStaff.name}</span>.
              </p>
              <Button variant="secondary" block class="mt-3" onClick={() => setActiveStaff(null)}>
                Switch staff member
              </Button>
            </Card>
          </section>
        )}

        <section>
          <SectionTitle>Shop account</SectionTitle>
          <Card>
            <Button variant="danger" block onClick={() => void controller.signOut()}>
              Sign out
            </Button>
          </Card>
          <div class="mt-2">
            <InfoNote>
              Signing out stops sync on this device. Anything already saved here stays until it
              syncs, so sign out only when you mean to hand the device on.
            </InfoNote>
          </div>
        </section>
      </div>
    </Screen>
  )
}

function Group({ title, entries }: { title: string; entries: readonly Entry[] }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <Card padded={false}>
        <RowList>
          {entries.map(({ href, label, hint, Icon }) => (
            <li key={href}>
              <ListRow
                href={href}
                leading={
                  <span class="flex size-9 items-center justify-center rounded-[0.65rem] bg-surface-sunken text-content-muted">
                    <Icon size={18} />
                  </span>
                }
              >
                <span class="block font-medium">{label}</span>
                <span class="block truncate text-sm text-content-muted">{hint}</span>
              </ListRow>
            </li>
          ))}
        </RowList>
      </Card>
    </section>
  )
}
