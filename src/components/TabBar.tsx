import { useMemo } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { Avatar } from './ui'
import { SyncBadge } from './SyncBadge'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { today } from '../lib/dates'
import { OPEN_STAGES } from '../screens/today/todayModel'
import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../hooks/useReplication'
import {
  IconChart,
  IconChevronRight,
  IconHome,
  IconOrders,
  IconPlus,
  IconReceipt,
  IconSettings,
  IconTag,
  IconUsers,
} from './icons'

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
  { href: '/orders', label: 'Orders', Icon: IconOrders, prefix: '/orders' },
]

/**
 * "Money" rather than "Reports": the phone's question is what the shop took and
 * spent. The tab opens a hub over sales, expenses and reports, so none of the
 * three is buried in Settings.
 */
const TRAILING_TABS: readonly TabDef[] = [
  { href: '/clients', label: 'Clients', Icon: IconUsers, prefix: '/clients' },
  { href: '/money', label: 'Money', Icon: IconChart, prefix: '/money' },
]

/** The money tab stays lit on the screens its hub leads to. */
const MONEY_PATHS = ['/money', '/sales', '/expenses', '/reports']

const RAIL_WORK: readonly TabDef[] = [
  { href: '/', label: 'Today', Icon: IconHome, prefix: '/' },
  { href: '/orders', label: 'Orders', Icon: IconOrders, prefix: '/orders' },
  { href: '/clients', label: 'Clients', Icon: IconUsers, prefix: '/clients' },
]

const RAIL_MONEY: readonly TabDef[] = [
  { href: '/sales', label: 'Sales', Icon: IconTag, prefix: '/sales' },
  { href: '/expenses', label: 'Expenses', Icon: IconReceipt, prefix: '/expenses' },
  { href: '/reports', label: 'Reports', Icon: IconChart, prefix: '/reports' },
]

function isActive(currentPath: string, prefix: string): boolean {
  if (prefix === '/') return currentPath === '/'
  if (prefix === '/money') {
    return MONEY_PATHS.some((path) => currentPath === path || currentPath.startsWith(`${path}/`))
  }
  return currentPath === prefix || currentPath.startsWith(`${prefix}/`)
}

/**
 * The order form is a task, not a destination: it has its own Cancel and Save
 * pinned to the bottom edge, and tab-switching mid-draft silently discards it.
 */
function isFullScreenTask(path: string): boolean {
  return (
    path === '/orders/new' ||
    // Same reasoning: the sale form pins its own Cancel/Record pair at the
    // bottom, and the floating pill sat on top of them -- the primary action
    // was partly un-tappable.
    path === '/sales/new' ||
    /^\/orders\/[^/]+\/edit$/.test(path)
  )
}

export function TabBar() {
  const { path } = useLocation()

  if (isFullScreenTask(path)) return null

  return (
    <nav
      // Hidden from lg up, where SideRail takes over. A thumb-reached bar at
      // the bottom of a 1440px screen is a long way from the pointer.
      class="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line
             bg-surface safe-bottom lg:hidden"
      aria-label="Main"
    >
      {LEADING_TABS.map((tab) => (
        <Tab key={tab.href} {...tab} active={isActive(path, tab.prefix)} />
      ))}

      {/* In the bar, not raised above it. Raised, it overhung its own stacking
          context and covered part of the order form's submit button. */}
      <span class="flex flex-1 items-center justify-center">
        <a
          href="/orders/new"
          aria-label="Take an order"
          class="flex size-[46px] items-center justify-center rounded-full bg-accent
                 text-accent-content transition-transform active:scale-95"
        >
          <IconPlus size={22} />
        </a>
      </span>

      {TRAILING_TABS.map((tab) => (
        <Tab key={tab.href} {...tab} active={isActive(path, tab.prefix)} />
      ))}
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
      class={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-[3px]
              transition-colors ${active ? 'text-accent' : 'text-content-subtle'}`}
    >
      <Icon size={20} stroke-width={active ? 2.1 : 1.75} />
      {/* Every label, always. Four destinations is under the legibility ceiling
          this file used to argue about, and a bar where only the active item is
          named makes you tap to find out what the others are. */}
      <span class={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
    </a>
  )
}

/**
 * Desktop navigation: a fixed rail down the left edge, from `lg` up.
 *
 * Structured rather than a list of links, because a rail is the one piece of
 * chrome always on screen and it can carry things the tab bar has no room for:
 *
 *  - who is working and which shop, which on a phone lives in Today's profile
 *    header and in the Shell's status strip. Both are mobile answers to
 *    "there is nowhere else to put this"; on desktop there is.
 *  - Reports and Settings as real destinations. They were reachable only
 *    through a `...` sheet on Today -- two taps deep for the screen that
 *    answers "what did I collect this week", which is the question a shop
 *    owner asks daily.
 *  - the overdue count, next to the destination that resolves it.
 *  - sync state, pinned at the foot. ARCHITECTURE section 9 requires it to be
 *    visible on every screen; the rail satisfies that for all of them at once,
 *    which is why the Shell's strip stands down at this width.
 */
export function SideRail({
  online,
  auth,
  replication,
}: {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}) {
  const { path } = useLocation()
  const { db, shop, activeStaff } = useCurrentShop()
  const now = today()

  const orderDocs = useRxQuery(
    () => db.orders.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )

  // Only overdue gets a badge. A count beside every destination is wallpaper;
  // a count beside the one thing that is late is a prompt.
  const overdue = useMemo(
    () =>
      orderDocs.filter((doc) => {
        const order = doc.toJSON()
        return OPEN_STAGES.includes(order.stage) && order.pickup_due_date < now
      }).length,
    [orderDocs, now],
  )

  return (
    <nav
      class="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-stone-200
             bg-white px-3 py-4 lg:flex dark:border-stone-800 dark:bg-stone-900"
      aria-label="Main"
    >
      <a
        href="/settings"
        class="mb-4 flex min-h-12 items-center gap-2.5 rounded-card px-2 transition-colors
               hover:bg-stone-100 dark:hover:bg-stone-800"
      >
        {activeStaff && <Avatar name={activeStaff.name} size="sm" />}
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-semibold">{shop.name}</span>
          {activeStaff && (
            <span class="block truncate text-xs text-stone-500 dark:text-stone-400">
              {activeStaff.name}
            </span>
          )}
        </span>
        <IconChevronRight size={16} />
      </a>

      <a
        href="/orders/new"
        class="mb-4 flex min-h-11 items-center justify-center gap-2 rounded-control
               bg-stone-900 px-4 text-[15px] font-medium text-white
               transition-transform active:scale-[0.98] dark:bg-white dark:text-stone-900"
      >
        <IconPlus size={20} /> Take an order
      </a>

      {/* The rail has room, so it skips the Money hub and lists what the hub
          holds. Only the bar, with four slots, needs to group them. */}
      <div class="flex flex-col gap-0.5">
        {RAIL_WORK.map((tab) => (
          <RailItem
            key={tab.href}
            {...tab}
            active={isActive(path, tab.prefix)}
            badge={tab.href === '/orders' && overdue > 0 ? overdue : undefined}
          />
        ))}
      </div>

      <div class="my-3 border-t border-stone-200 dark:border-stone-800" />

      <div class="flex flex-col gap-0.5">
        {RAIL_MONEY.map((tab) => (
          <RailItem key={tab.href} {...tab} active={isActive(path, tab.prefix)} />
        ))}
        <RailItem
          href="/settings"
          label="Settings"
          Icon={IconSettings}
          prefix="/settings"
          active={isActive(path, '/settings')}
        />
      </div>

      <div class="mt-auto px-3 pt-4">
        <SyncBadge online={online} auth={auth} replication={replication} />
      </div>
    </nav>
  )
}

function RailItem({
  href,
  label,
  Icon,
  active,
  badge,
}: TabDef & { active: boolean; badge?: number }) {
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
      <span class="flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span
          class={`min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums ${
            active
              ? 'bg-white/20 text-white dark:bg-stone-900/15 dark:text-stone-900'
              : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
          }`}
          aria-label={`${badge} overdue`}
        >
          {badge}
        </span>
      )}
    </a>
  )
}
