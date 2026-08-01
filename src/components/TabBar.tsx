import { useLocation } from 'preact-iso'
import { IconHome, IconOrders, IconPlus } from './icons'

/**
 * Bottom navigation: a floating pill inset from the left, right and bottom
 * edges, rather than a bar welded to the bottom edge.
 *
 * Bottom rather than top because the top of a modern handset is out of thumb
 * reach one-handed. The bar holds exactly three items -- Today, the create
 * action, and Book -- per spec A13. Orders and Clients merged behind Book
 * (A14: one tab, two routes, no new URL -- see Orders.tsx and Clients.tsx for
 * the segmented control that switches between them in place). Reports and
 * Settings left the bar entirely (A15): Reports is reachable from a row in
 * Settings and from Today's profile header, and Settings from the profile
 * header's identity block.
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
  /**
   * Path prefixes that count as this tab being active. Book owns two --
   * `/orders` and `/clients` -- because merging the destinations (A14) did
   * not merge their routes; either one has to light up the same tab.
   */
  prefixes: readonly string[]
}

const TODAY_TAB: TabDef = { href: '/', label: 'Today', Icon: IconHome, prefixes: ['/'] }

/**
 * "Book" rather than "Orders" -- the shop's own word for the order book, and
 * the name for what used to be two destinations. There is no dedicated book
 * icon (see icons.tsx' doc header on bundle size); `IconOrders` is the
 * closest fit since the order book is the primary sense of the merge.
 */
const BOOK_TAB: TabDef = {
  href: '/orders',
  label: 'Book',
  Icon: IconOrders,
  prefixes: ['/orders', '/clients'],
}

function isActive(currentPath: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => {
    if (prefix === '/') return currentPath === '/'
    return currentPath === prefix || currentPath.startsWith(`${prefix}/`)
  })
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
        <Tab
          href={TODAY_TAB.href}
          label={TODAY_TAB.label}
          Icon={TODAY_TAB.Icon}
          active={isActive(path, TODAY_TAB.prefixes)}
        />

        <a
          href="/orders/new"
          aria-label="Take an order"
          class="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-700
                 text-white transition-transform active:scale-95 dark:bg-brand-600"
        >
          <IconPlus size={22} />
        </a>

        <Tab
          href={BOOK_TAB.href}
          label={BOOK_TAB.label}
          Icon={BOOK_TAB.Icon}
          active={isActive(path, BOOK_TAB.prefixes)}
        />
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
