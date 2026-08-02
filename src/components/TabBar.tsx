import { useLocation } from 'preact-iso'
import { IconHome, IconOrders, IconPlus, IconUsers } from './icons'

/**
 * Bottom navigation: a floating pill inset from the left, right and bottom
 * edges, rather than a bar welded to the bottom edge.
 *
 * Bottom rather than top because the top of a modern handset is out of thumb
 * reach one-handed. Four destinations -- Today, Clients, Orders -- plus the
 * create action between them (A25).
 *
 * Four was the ceiling this file used to argue against, and the argument was
 * about four *labels* at 390px. That is no longer what is on screen: only the
 * active tab is labelled (A6), so four items cost four icons and one word.
 *
 * Orders and Clients were briefly merged behind one "Book" tab (A13/A14). It
 * shipped two stacked segmented rows on /orders -- the Orders|Clients switch
 * above the filter row Orders already had -- so the merge is withdrawn. Reports
 * and Settings are reached from the More sheet in Today's profile header.
 *
 * Only the active tab carries a label, as a filled pill; the inactive one is
 * a bare icon at a fixed 44px square. That is the point of the change -- the
 * label appears exactly once on screen instead of competing with the
 * screen's own title -- and it is why the bar's items are not equal width:
 * the active pill sizes to its own content while its neighbour stays fixed,
 * so the layout is flex, not a grid.
 *
 * The pill itself is content-sized and centred, so it breathes in and out by
 * the few pixels between "Today" and "Book" as you move between tabs. It is
 * deliberately not viewport-width: three items stretched across 512px read as
 * three unrelated buttons rather than one control.
 *
 * The centre action sits *in* the bar rather than raised above it. Raised, it
 * overhung the bar's top edge in its own stacking context, and on the order
 * form it covered part of the "Create order" button: a tap inside the submit
 * button's own rectangle navigated to a new order instead of submitting. Flat
 * and laid out normally, that class of overlap cannot happen at all.
 */
interface TabDef {
  href: string
  label: string
  Icon: (props: { size?: number; 'stroke-width'?: number }) => preact.JSX.Element
  /** Path prefix that counts as this tab being active. */
  prefix: string
}

/** Left of the create action, then right of it. */
const LEADING_TABS: readonly TabDef[] = [
  { href: '/', label: 'Today', Icon: IconHome, prefix: '/' },
  { href: '/clients', label: 'Clients', Icon: IconUsers, prefix: '/clients' },
]

const TRAILING_TABS: readonly TabDef[] = [
  { href: '/orders', label: 'Orders', Icon: IconOrders, prefix: '/orders' },
]

function isActive(currentPath: string, prefix: string): boolean {
  if (prefix === '/') return currentPath === '/'
  return currentPath === prefix || currentPath.startsWith(`${prefix}/`)
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
      // Hidden from lg up, where SideRail takes over. A thumb-reached bar at
      // the bottom of a 1440px screen is a long way from the pointer.
      class="fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30
             flex justify-center px-4 lg:hidden"
      aria-label="Main"
    >
      {/* Sized by its contents, not by the viewport: `w-full` with
          `justify-between` stretched the pill to 512px and pushed three items
          to its edges. `max-w-full` is the only width constraint it needs. */}
      <div
        class="flex max-w-full items-center gap-2 rounded-full
               border border-stone-200/80 bg-white/85 p-2 backdrop-blur-lg
               dark:border-stone-800 dark:bg-stone-900/85
               supports-backdrop-filter:bg-white/70
               dark:supports-backdrop-filter:bg-stone-900/70"
      >
        {LEADING_TABS.map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(path, tab.prefix)} />
        ))}

        <a
          href="/orders/new"
          aria-label="Take an order"
          class="flex size-11 shrink-0 items-center justify-center rounded-full bg-stone-900
                 text-white transition-transform active:scale-95
                 dark:bg-white dark:text-stone-900"
        >
          <IconPlus size={22} />
        </a>

        {TRAILING_TABS.map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(path, tab.prefix)} />
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
}: TabDef & { active: boolean }) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      class={`flex shrink-0 items-center justify-center gap-1.5 rounded-full
              transition-colors ${
                active
                  ? 'h-11 bg-stone-900 px-3.5 text-white dark:bg-white dark:text-stone-900'
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

/**
 * Desktop navigation: a fixed rail down the left edge, from `lg` up.
 *
 * The same destinations as the tab bar and in the same order, so the mental
 * model does not change with the window -- what changes is reachability. A
 * bottom bar is where a thumb is on a handset and where nothing is on a
 * desktop, so above `lg` the bar hides and this takes its place.
 *
 * Labels are always shown here. The tab bar labels only the active item
 * because four labels do not fit at 390px; that constraint does not exist at
 * 1024px, and unlabelled icons would be a needless guessing game.
 */
export function SideRail() {
  const { path } = useLocation()

  return (
    <nav
      class="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col gap-1 border-r
             border-stone-200 bg-white px-3 py-5 lg:flex
             dark:border-stone-800 dark:bg-stone-900"
      aria-label="Main"
    >
      <a
        href="/orders/new"
        class="mb-3 flex min-h-11 items-center justify-center gap-2 rounded-control
               bg-stone-900 px-4 text-[15px] font-medium text-white
               dark:bg-white dark:text-stone-900"
      >
        <IconPlus size={20} /> Take an order
      </a>

      {[...LEADING_TABS, ...TRAILING_TABS].map((tab) => (
        <RailItem key={tab.href} {...tab} active={isActive(path, tab.prefix)} />
      ))}
    </nav>
  )
}

function RailItem({ href, label, Icon, active }: TabDef & { active: boolean }) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      class={`flex min-h-11 items-center gap-3 rounded-control px-3.5 text-[15px]
              transition-colors ${
                active
                  ? 'bg-stone-900 font-medium text-white dark:bg-white dark:text-stone-900'
                  : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
              }`}
    >
      <Icon size={20} stroke-width={active ? 2.1 : 1.75} />
      {label}
    </a>
  )
}
