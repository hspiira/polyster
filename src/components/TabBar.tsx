import { useMemo } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { Avatar } from './ui'
import { SyncBadge } from './SyncBadge'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import { today } from '../lib/dates'
import { isFullScreenTask } from '../lib/navigation'
import { OPEN_STAGES } from '../screens/today/todayModel'
import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../hooks/useReplication'
import type { FeatureKey } from '../db/schema'
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
  type IconComponent,
} from './icons'

/* Bottom navigation: four destinations plus the create action between them
   (A25). Bottom, not top -- a handset's top edge is out of thumb reach. */
interface TabDef {
  href: string
  label: string
  Icon: IconComponent
  /** Path prefix that counts as this tab being active. */
  prefix: string
  feature?: FeatureKey
}

/** Left of the create action, then right of it. */
const LEADING_TABS: readonly TabDef[] = [
  { href: '/', label: 'Today', Icon: IconHome, prefix: '/' },
  { href: '/orders', label: 'Orders', Icon: IconOrders, prefix: '/orders' },
]

/* "Money", not "Reports": the phone's question is what the shop took and spent.
   The tab opens a hub over sales, expenses and reports. */
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
  { href: '/sales', label: 'Sales', Icon: IconTag, prefix: '/sales', feature: 'sales' },
  { href: '/expenses', label: 'Expenses', Icon: IconReceipt, prefix: '/expenses', feature: 'expenses' },
  { href: '/reports', label: 'Reports', Icon: IconChart, prefix: '/reports' },
]

function isActive(currentPath: string, prefix: string): boolean {
  if (prefix === '/') return currentPath === '/'
  if (prefix === '/money') {
    return MONEY_PATHS.some((path) => currentPath === path || currentPath.startsWith(`${path}/`))
  }
  return currentPath === prefix || currentPath.startsWith(`${prefix}/`)
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
      {/* Every label, always: a bar where only the active item is named makes
          you tap to find out what the others are. */}
      <span class={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
    </a>
  )
}

/* Desktop navigation from `lg` up. Carries what the tab bar has no room for:
   who is working, Reports and Settings, the overdue count, and sync state. */
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
  const flags = useFeatureFlags(db, shop.id)
  const railMoney = RAIL_MONEY.filter((tab) => !tab.feature || flags[tab.feature])

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
      class="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line
             bg-surface px-3 py-4 lg:flex"
      aria-label="Main"
    >
      <a
        href="/settings"
        class="mb-4 flex min-h-12 items-center gap-2.5 rounded-card px-2 transition-colors
               hover:bg-hover"
      >
        {activeStaff && <Avatar name={activeStaff.name} size="sm" />}
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-semibold">{shop.name}</span>
          {activeStaff && (
            <span class="block truncate text-xs text-content-muted">
              {activeStaff.name}
            </span>
          )}
        </span>
        <IconChevronRight size={16} />
      </a>

      <a
        href="/orders/new"
        class="mb-4 flex min-h-11 items-center justify-center gap-2 rounded-control
               bg-content px-4 text-[15px] font-medium text-content-inverted
               transition-transform active:scale-[0.98]"
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

      <div class="my-3 border-t border-line" />

      <div class="flex flex-col gap-0.5">
        {railMoney.map((tab) => (
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
                  ? 'bg-content font-medium text-content-inverted'
                  : 'text-content-muted hover:bg-hover'
              }`}
    >
      <Icon size={20} stroke-width={active ? 2.1 : 1.75} />
      <span class="flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span
          class={`min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums ${
            active
              ? 'bg-content-inverted/20 text-content-inverted'
              : 'bg-danger-soft text-danger-on-soft'
          }`}
          aria-label={`${badge} overdue`}
        >
          {badge}
        </span>
      )}
    </a>
  )
}
