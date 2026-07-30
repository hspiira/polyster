import { Button, Card, ListRow, Screen } from '../components/ui'
import { useShop } from '../state/ShopProvider'
import { useAuth } from '../hooks/useAuth'

const SECTIONS = [
  { href: '/settings/shop', label: 'Shop details', hint: 'Name and WhatsApp number' },
  {
    href: '/settings/measurements',
    label: 'Measurement fields',
    hint: 'What you record for each client',
  },
  { href: '/settings/staff', label: 'Staff', hint: 'Who can use this app, and their PINs' },
  { href: '/settings/backup', label: 'Backup', hint: 'Download a copy of everything' },
] as const

export function Settings() {
  const { shop, activeStaff, setActiveStaff } = useShop()
  const { controller } = useAuth()

  return (
    <Screen title="Settings">
      <div class="space-y-4">
        <Card class="!p-0">
          <ul class="px-3">
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <ListRow href={section.href}>
                  <span>
                    <span class="block font-medium text-gray-900">{section.label}</span>
                    <span class="block text-sm text-gray-500">{section.hint}</span>
                  </span>
                  <span class="text-gray-400" aria-hidden="true">
                    ›
                  </span>
                </ListRow>
              </li>
            ))}
          </ul>
        </Card>

        {activeStaff && (
          <Card>
            <p class="text-sm text-gray-600">
              Signed in as <span class="font-medium text-gray-900">{activeStaff.name}</span> on{' '}
              {shop?.name ?? 'this shop'}.
            </p>
            <Button
              variant="secondary"
              class="mt-3 w-full"
              onClick={() => setActiveStaff(null)}
            >
              Switch staff member
            </Button>
          </Card>
        )}

        <Card>
          <p class="text-sm text-gray-600">
            Signing out of the shop account stops sync on this device. Anything already saved here
            stays until it syncs.
          </p>
          <Button variant="danger" class="mt-3 w-full" onClick={() => void controller.signOut()}>
            Sign out of shop account
          </Button>
        </Card>
      </div>
    </Screen>
  )
}
