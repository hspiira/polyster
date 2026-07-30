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
  IconDownload,
  IconMoney,
  IconRuler,
  IconSettings,
  IconUsers,
} from '../components/icons'
import { useShop } from '../state/ShopProvider'
import { useAuth } from '../hooks/useAuth'

const SECTIONS = [
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
    hint: 'Who can use this app, and their PINs',
    Icon: IconUsers,
  },
  {
    href: '/settings/backup',
    label: 'Backup',
    hint: 'Download a copy of everything',
    Icon: IconDownload,
  },
] as const

export function Settings() {
  const { shop, activeStaff, setActiveStaff } = useShop()
  const { controller } = useAuth()

  return (
    <Screen title="Settings" subtitle={shop?.name}>
      <div class="space-y-5">
        <Card padded={false}>
          <RowList>
            {SECTIONS.map(({ href, label, hint, Icon }) => (
              <li key={href}>
                <ListRow
                  href={href}
                  leading={
                    <span class="flex size-9 items-center justify-center rounded-[0.65rem] bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                      <Icon size={18} />
                    </span>
                  }
                >
                  <span class="block font-medium">{label}</span>
                  <span class="block truncate text-sm text-stone-500 dark:text-stone-400">
                    {hint}
                  </span>
                </ListRow>
              </li>
            ))}
            <li>
              <ListRow
                href="/reports"
                leading={
                  <span class="flex size-9 items-center justify-center rounded-[0.65rem] bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    <IconMoney size={18} />
                  </span>
                }
              >
                <span class="block font-medium">Reports</span>
                <span class="block truncate text-sm text-stone-500 dark:text-stone-400">
                  Collected, outstanding, and stage counts
                </span>
              </ListRow>
            </li>
          </RowList>
        </Card>

        {activeStaff && (
          <section>
            <SectionTitle>This device</SectionTitle>
            <Card>
              <p class="text-sm text-stone-600 dark:text-stone-300">
                Working as <span class="font-medium text-stone-900 dark:text-stone-100">
                  {activeStaff.name}
                </span>
                .
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
