import { useLocation } from 'preact-iso'
import { IconHome, IconOrders, IconSettings, IconUsers } from './icons'

/**
 * Bottom navigation.
 *
 * Bottom rather than top because the top of a modern handset is out of thumb
 * reach on a one-handed grip. Four destinations is the ceiling: past that,
 * labels shrink below legibility on a narrow screen, so everything else lives
 * under Settings.
 *
 * Icons plus labels, not icons alone. An unlabelled icon is a guess, and this
 * app is used by people who did not choose it and were not trained on it.
 */
const TABS = [
  { href: '/', label: 'Today', Icon: IconHome },
  { href: '/clients', label: 'Clients', Icon: IconUsers },
  { href: '/orders', label: 'Orders', Icon: IconOrders },
  { href: '/settings', label: 'Settings', Icon: IconSettings },
] as const

function isActive(currentPath: string, href: string): boolean {
  if (href === '/') return currentPath === '/'
  return currentPath === href || currentPath.startsWith(`${href}/`)
}

export function TabBar() {
  const { path } = useLocation()

  return (
    <nav
      class="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200/80 bg-white/85
             backdrop-blur-lg safe-bottom dark:border-stone-800 dark:bg-stone-900/85
             supports-[backdrop-filter]:bg-white/70
             dark:supports-[backdrop-filter]:bg-stone-900/70"
      aria-label="Main"
    >
      <ul class="mx-auto flex max-w-lg">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(path, href)
          return (
            <li key={href} class="flex-1">
              <a
                href={href}
                aria-current={active ? 'page' : undefined}
                class={`relative flex min-h-14 flex-col items-center justify-center gap-1
                        transition-colors ${
                          active
                            ? 'text-brand-800 dark:text-brand-300'
                            : 'text-stone-500 dark:text-stone-400'
                        }`}
              >
                {/* A filled pill behind the active icon, the way a fitness
                    app's tab bar marks the current section, rather than the
                    thin top bar this replaces -- it reads at a glance without
                    needing the colour change on the label underneath it. */}
                <span
                  class={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${
                    active ? 'bg-brand-100 dark:bg-brand-950' : 'bg-transparent'
                  }`}
                >
                  <Icon size={22} stroke-width={active ? 2.1 : 1.75} />
                </span>
                <span class={`text-[11px] ${active ? 'font-semibold' : ''}`}>{label}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
