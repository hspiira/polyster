/**
 * Settings: how the app behaves, and nothing else. Sales, expenses and reports
 * are the day's work, not configuration, and live behind the Money tab.
 */
import { useState } from 'preact/hooks'
import {
  Card,
  ChoiceSheet,
  RowList,
  Screen,
  SectionTitle,
  SettingRow,
} from '../ui'
import {
  IconBox,
  IconCheck,
  IconContrast,
  IconDownload,
  IconFactory,
  IconFingerprint,
  IconLayers,
  IconLock,
  IconSignOut,
  IconRuler,
  IconSettings,
  IconSpool,
  IconTag,
  IconToggle,
  IconTruck,
  IconUsers,
} from '../components/icons'
import { useShop } from '../state/ShopProvider'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import { useBack } from '../hooks/useBack'
import type { ThemePreference } from '../lib/theme'

interface Entry {
  href: string
  label: string
  Icon: (props: { size?: number }) => preact.JSX.Element
}

const SHOP_ENTRIES: readonly Entry[] = [
  { href: '/settings/shop', label: 'Shop details', Icon: IconSettings },
  { href: '/settings/staff', label: 'Staff', Icon: IconUsers },
  { href: '/settings/measurements', label: 'Measurement fields', Icon: IconRuler },
  { href: '/settings/features', label: 'Modules', Icon: IconToggle },
]

const MODULE_ENTRIES: readonly Entry[] = [
  { href: '/catalogue', label: 'Catalogue', Icon: IconTag },
  { href: '/collections', label: 'Collections', Icon: IconLayers },
  { href: '/suppliers', label: 'Suppliers', Icon: IconTruck },
  { href: '/materials', label: 'Materials', Icon: IconSpool },
  { href: '/inventory', label: 'Inventory', Icon: IconBox },
  { href: '/production', label: 'Production', Icon: IconFactory },
  { href: '/garment-units', label: 'Garment identity', Icon: IconFingerprint },
]

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

export function Settings() {
  const back = useBack()
  const { db, shop, activeStaff, setActiveStaff } = useShop()
  const { controller } = useAuth()
  const flags = useFeatureFlags(db, shop?.id ?? '__none__')
  const [theme, chooseTheme] = useTheme()
  const install = useInstallPrompt()
  const [choosingTheme, setChoosingTheme] = useState(false)

  const shopEntries = SHOP_ENTRIES.filter((entry) =>
    entry.href === '/settings/measurements' ? flags.measurements : true,
  )

  const moduleEntries = MODULE_ENTRIES.filter((entry) => {
    if (entry.href === '/catalogue') return flags.catalogue
    if (entry.href === '/collections') return flags.collections
    if (entry.href === '/suppliers' || entry.href === '/materials') return flags.suppliers
    if (entry.href === '/inventory') return flags.inventory
    if (entry.href === '/production') return flags.production
    if (entry.href === '/garment-units') return flags.garment_identity
    return true
  })

  return (
    <Screen title="Settings" subtitle={shop?.name} back={back} width="wide">
      <div class="lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <div class="space-y-section">
          <Group title="Your shop" entries={shopEntries} />
          {moduleEntries.length > 0 && <Group title="Modules" entries={moduleEntries} />}
        </div>

        <div class="mt-section space-y-section lg:mt-0">
          <section>
            <SectionTitle>This device</SectionTitle>
            <Card padded={false}>
              <RowList>
                <li>
                  <SettingRow
                    icon={<IconContrast size={20} />}
                    label="Theme"
                    value={THEME_LABELS[theme]}
                    onClick={() => setChoosingTheme(true)}
                  />
                </li>
                <li>
                  <SettingRow icon={<IconLock size={20} />} label="Lock" href="/settings/lock" />
                </li>
                <li>
                  <SettingRow
                    icon={<IconDownload size={20} />}
                    label="Backup"
                    href="/settings/backup"
                  />
                </li>
                {install.isStandalone ? (
                  <li>
                    <SettingRow
                      icon={<IconCheck size={20} />}
                      label="Installed"
                      tone="success"
                      value="On this device"
                    />
                  </li>
                ) : (
                  install.canPrompt && (
                    <li>
                      <SettingRow
                        icon={<IconDownload size={20} />}
                        label="Add to home screen"
                        onClick={() => void install.prompt()}
                      />
                    </li>
                  )
                )}
              </RowList>
            </Card>
          </section>

          <section>
            <SectionTitle>Account</SectionTitle>
            <Card padded={false}>
              <RowList>
                {activeStaff && (
                  <li>
                    <SettingRow
                      icon={<IconUsers size={20} />}
                      label="Working as"
                      value={activeStaff.name}
                      onClick={() => setActiveStaff(null)}
                    />
                  </li>
                )}
                <li>
                  <SettingRow
                    icon={<IconSignOut size={20} />}
                    label="Sign out"
                    tone="danger"
                    onClick={() => void controller.signOut()}
                  />
                </li>
              </RowList>
            </Card>
          </section>
        </div>
      </div>

      <ChoiceSheet
        open={choosingTheme}
        title="Theme"
        value={theme}
        options={THEME_OPTIONS}
        onChoose={chooseTheme}
        onClose={() => setChoosingTheme(false)}
      />
    </Screen>
  )
}

function Group({ title, entries }: { title: string; entries: readonly Entry[] }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <Card padded={false}>
        <RowList>
          {entries.map(({ href, label, Icon }) => (
            <li key={href}>
              <SettingRow icon={<Icon size={20} />} label={label} href={href} />
            </li>
          ))}
        </RowList>
      </Card>
    </section>
  )
}
