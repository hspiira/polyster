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
  IconReceipt,
  IconTag,
  IconRuler,
  IconSettings,
  IconUsers,
} from '../components/icons'
import { useShop } from '../state/ShopProvider'
import { useAuth } from '../hooks/useAuth'
import {
  automaticWouldPick,
  chooseLayout,
  currentPreference,
  layoutOptions,
} from '../components/layoutSwitch'

/** Also rendered by Today's More sheet (A26), so the strings live in one place. */
export const SECTIONS = [
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
  {
    href: '/sales',
    label: 'Sales',
    hint: 'Counter sales, and what sells most',
    Icon: IconTag,
  },
  {
    href: '/expenses',
    label: 'Expenses',
    hint: 'Money out, so profit means something',
    Icon: IconReceipt,
  },
  {
    href: '/reports',
    label: 'Reports',
    hint: 'Profit, collected, outstanding, stages',
    Icon: IconMoney,
  },
] as const

export function Settings() {
  const { shop, activeStaff, setActiveStaff } = useShop()
  const { controller } = useAuth()

  return (
    <Screen title="Settings" subtitle={shop?.name} back="/">
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

        <LayoutSection />

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

/**
 * The way to the desktop layout, and back.
 *
 * On this side it matters most: someone who pinned the phone layout on a laptop
 * has no other route out, and the first version of this override shipped with a
 * one-way button and no return.
 */
function LayoutSection() {
  const preference = currentPreference()
  const automatic = automaticWouldPick()

  return (
    <section>
      <SectionTitle>Layout</SectionTitle>
      <Card padded={false}>
        <RowList>
          {layoutOptions().map((option) => (
            <li key={option.value}>
              <button
                type="button"
                aria-pressed={preference === option.value}
                onClick={() => chooseLayout(option.value)}
                class="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <span class="min-w-0 flex-1">
                  <span class="block font-medium">
                    {option.label}
                    {option.value === 'auto' && (
                      <span class="font-normal text-stone-500 dark:text-stone-400">
                        {' '}
                        · {automatic === 'web' ? 'desktop' : 'phone'} on this device
                      </span>
                    )}
                  </span>
                  <span class="block text-sm text-stone-500 dark:text-stone-400">
                    {option.hint}
                  </span>
                </span>
                {preference === option.value && (
                  <span class="shrink-0 text-brand-700 dark:text-brand-300" aria-hidden="true">
                    &#10003;
                  </span>
                )}
              </button>
            </li>
          ))}
        </RowList>
      </Card>
      <div class="mt-2">
        <InfoNote>
          The desktop layout is denser and built for a mouse and keyboard. Changing this reloads
          the app.
        </InfoNote>
      </div>
    </section>
  )
}
