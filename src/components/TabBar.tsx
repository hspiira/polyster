import { useLocation } from 'preact-iso'

/**
 * Bottom navigation. Bottom rather than top because this is a phone app used
 * one-handed -- the top of a modern handset is out of thumb reach.
 *
 * Four destinations is the ceiling: past that, labels shrink below legibility
 * on a narrow screen. Anything else lives under Settings.
 */
const TABS = [
  { href: '/', label: 'Today' },
  { href: '/clients', label: 'Clients' },
  { href: '/orders', label: 'Orders' },
  { href: '/settings', label: 'Settings' },
] as const

function isActive(currentPath: string, href: string): boolean {
  if (href === '/') return currentPath === '/'
  return currentPath === href || currentPath.startsWith(`${href}/`)
}

export function TabBar() {
  const { path } = useLocation()

  return (
    <nav
      class="sticky bottom-0 z-10 border-t border-gray-200 bg-white/95 backdrop-blur
             pb-[env(safe-area-inset-bottom)]"
      aria-label="Main"
    >
      <ul class="mx-auto flex max-w-lg">
        {TABS.map((tab) => {
          const active = isActive(path, tab.href)
          return (
            <li key={tab.href} class="flex-1">
              <a
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                class={`flex min-h-14 items-center justify-center text-sm ${
                  active ? 'font-semibold text-gray-900' : 'text-gray-500'
                }`}
              >
                {tab.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
