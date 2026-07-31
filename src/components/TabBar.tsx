import { useLocation } from 'preact-iso'
import { IconHome, IconMoney, IconOrders, IconPlus, IconUsers } from './icons'

/**
 * Bottom navigation: four labelled destinations, split two-and-two, with the
 * create action centred between them.
 *
 * Bottom rather than top because the top of a modern handset is out of thumb
 * reach one-handed. Four labels is the ceiling -- past that they shrink below
 * legibility on a narrow screen. Settings therefore lives in the status strip
 * rather than here, and the centre button is an action, not a fifth label.
 *
 * The centre action sits *in* the bar rather than raised above it. Raised, it
 * overhung the bar's top edge in its own stacking context, and on the order
 * form it covered part of the "Create order" button: a tap inside the submit
 * button's own rectangle navigated to a new order instead of submitting. Flat
 * and laid out normally, that class of overlap cannot happen at all.
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

/**
 * The order form is a task, not a destination: it has its own Cancel and Save
 * pinned to the bottom edge, and tab-switching mid-draft silently discards it.
 */
function isFullScreenTask(path: string): boolean {
  return path === '/orders/new' || /^\/orders\/[^/]+\/edit$/.test(path)
}

export function TabBar() {
  const { path } = useLocation()

  if (isFullScreenTask(path)) return null

  return (
    <nav class="fixed inset-x-0 bottom-0 z-30 bg-white safe-bottom dark:bg-stone-900" aria-label="Main">
      <div class="mx-auto flex max-w-lg items-stretch">
        {TABS.slice(0, 2).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(path, tab.href)} />
        ))}

        <span class="flex w-16 shrink-0 items-center justify-center">
          <a
            href="/orders/new"
            aria-label="Take an order"
            class="flex size-11 items-center justify-center rounded-full bg-brand-700
                   text-white transition-transform active:scale-95 dark:bg-brand-600"
          >
            <IconPlus size={24} />
          </a>
        </span>

        {TABS.slice(2).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(path, tab.href)} />
        ))}
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
      class={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 pt-1 transition-colors ${
        active ? 'text-brand-700 dark:text-brand-300' : 'text-stone-500 dark:text-stone-400'
      }`}
    >
      <Icon size={22} stroke-width={active ? 2.1 : 1.75} />
      <span class={`text-[11px] ${active ? 'font-semibold' : ''}`}>{label}</span>
    </a>
  )
}
