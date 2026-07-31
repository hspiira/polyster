import { useLocation } from 'preact-iso'
import { IconHome, IconMoney, IconOrders, IconPlus, IconUsers } from './icons'

/**
 * Bottom navigation: a floating pill inset from the left, right and bottom
 * edges, rather than a bar welded to the bottom edge.
 *
 * Bottom rather than top because the top of a modern handset is out of thumb
 * reach one-handed. Four destinations is the ceiling -- past that, labels
 * shrink below legibility on a narrow screen. Settings therefore lives in the
 * status strip rather than here, and the centre button is an action, not a
 * fifth destination.
 *
 * Only the active tab carries a label, as a filled pill; the other three are
 * bare icons at a fixed 44px square. That is the point of the change -- the
 * label appears exactly once on screen instead of competing with the
 * screen's own title -- and it is why the bar's items are not equal width:
 * the active pill sizes to its own content ("Reports" is the long case)
 * while its neighbours stay fixed, so the layout is flex, not a grid.
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
    <nav
      class="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30
             flex justify-center px-4"
      aria-label="Main"
    >
      <div
        class="flex w-full max-w-lg items-center justify-between gap-1 rounded-full
               border border-stone-200/80 bg-white/85 p-2 backdrop-blur-lg
               dark:border-stone-800 dark:bg-stone-900/85
               supports-backdrop-filter:bg-white/70
               dark:supports-backdrop-filter:bg-stone-900/70"
      >
        {TABS.slice(0, 2).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(path, tab.href)} />
        ))}

        <a
          href="/orders/new"
          aria-label="Take an order"
          class="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-700
                 text-white transition-transform active:scale-95 dark:bg-brand-600"
        >
          <IconPlus size={22} />
        </a>

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
      class={`flex shrink-0 items-center justify-center gap-1.5 rounded-full
              transition-colors ${
                active
                  ? 'h-11 bg-brand-100 px-3.5 text-brand-800 dark:bg-brand-950 dark:text-brand-300'
                  : 'size-11 text-stone-500 active:bg-stone-200 dark:text-stone-400 dark:active:bg-stone-800'
              }`}
    >
      <Icon size={20} stroke-width={active ? 2.1 : 1.75} />
      {/* Kept in the DOM either way for assistive tech; hidden visually when
          inactive so the label reads exactly once on screen. */}
      <span class={active ? 'text-[13px] font-semibold' : 'sr-only'}>{label}</span>
    </a>
  )
}
