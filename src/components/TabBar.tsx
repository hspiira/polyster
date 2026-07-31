import { useLocation } from 'preact-iso'
import { IconHome, IconMoney, IconOrders, IconPlus, IconUsers } from './icons'

/**
 * Bottom navigation: four labelled destinations, split two-and-two, with the
 * create action raised over the centre seam.
 *
 * Bottom rather than top because the top of a modern handset is out of thumb
 * reach one-handed. Four labels is the ceiling -- past that they shrink below
 * legibility on a narrow screen. Settings therefore lives in the status strip
 * rather than here, and the centre button is an action, not a fifth label.
 */
const TABS = [
  { href: '/', label: 'Today', Icon: IconHome },
  { href: '/clients', label: 'Clients', Icon: IconUsers },
  { href: '/orders', label: 'Orders', Icon: IconOrders },
  { href: '/reports', label: 'Reports', Icon: IconMoney },
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
             supports-backdrop-filter:bg-white/70
             dark:supports-backdrop-filter:bg-stone-900/70"
      aria-label="Main"
    >
      <div class="relative mx-auto flex max-w-lg">
        {TABS.slice(0, 2).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(path, tab.href)} />
        ))}

        {/* Reserves the centre for the raised button, which is positioned
            rather than laid out so it can overhang the bar's top edge. */}
        <span class="w-16 shrink-0" aria-hidden="true" />

        {TABS.slice(2).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(path, tab.href)} />
        ))}

        <a
          href="/orders/new"
          aria-label="Take an order"
          class="absolute left-1/2 top-0 flex size-14 -translate-x-1/2 -translate-y-4
                 items-center justify-center rounded-full bg-brand-700 text-white
                 shadow-raised transition-transform active:scale-95 dark:bg-brand-600"
        >
          <IconPlus size={26} />
        </a>
      </div>
    </nav>
  )
}

function Tab({
  href,
  label,
  Icon,
  active,
}: {
  href: string
  label: string
  Icon: (props: { size?: number; 'stroke-width'?: number }) => preact.JSX.Element
  active: boolean
}) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      class={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 transition-colors ${
        active ? 'text-brand-800 dark:text-brand-300' : 'text-stone-500 dark:text-stone-400'
      }`}
    >
      <span
        class={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${
          active ? 'bg-brand-100 dark:bg-brand-950' : 'bg-transparent'
        }`}
      >
        <Icon size={22} stroke-width={active ? 2.1 : 1.75} />
      </span>
      <span class={`text-[11px] ${active ? 'font-semibold' : ''}`}>{label}</span>
    </a>
  )
}
