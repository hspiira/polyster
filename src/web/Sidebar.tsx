/**
 * The sidebar: grouped destinations, live counts, and the primary action.
 *
 * The create action lives in the nav rather than floating over the content,
 * which is the web convention and the reason the web design needs no floating
 * button at all. Counts are real reactive queries -- a nav that lies about how
 * much work there is would be worse than one that says nothing.
 *
 * Groups rather than a flat list: nine destinations unlabelled is a wall.
 * "Work" is what the shop does today, "Money" is what it made, "Shop" is
 * configuration you touch monthly.
 */
import { useMemo } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import { usePermission } from '../hooks/usePermission'
import { OPEN_STAGES } from '../screens/today/todayModel'
import { SyncBadge } from '../components/SyncBadge'
import {
  IconBox,
  IconFactory,
  IconFingerprint,
  IconLayers,
  IconMoney,
  IconOrders,
  IconPlus,
  IconRuler,
  IconSettings,
  IconSpool,
  IconTag,
  IconTruck,
  IconUsers,
  type IconComponent,
} from '../components/icons'
import { cn } from '../lib/cn'
import { RADIUS, TEXT_SM, TEXT_XS } from './chrome'
import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../hooks/useReplication'
import type { FeatureKey } from '../db/schema'

interface NavItem {
  href: string
  label: string
  Icon?: IconComponent
  count?: number
  feature?: FeatureKey
}

function isActive(path: string, href: string): boolean {
  if (href === '/') return path === '/'
  return path === href || path.startsWith(`${href}/`)
}

export function Sidebar({
  online,
  auth,
  replication,
}: {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}) {
  const { db, shop } = useCurrentShop()
  const { path } = useLocation()
  const flags = useFeatureFlags(db, shop.id)
  const canViewReports = usePermission('reports.view')

  const orderDocs = useRxQuery(
    () => db.orders.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )

  // Orders counts what is open, not what exists. "142" beside Orders when 128
  // of them were collected last year is a number nobody can act on.
  const openOrders = useMemo(
    () => orderDocs.filter((doc) => OPEN_STAGES.includes(doc.toJSON().stage)).length,
    [orderDocs],
  )

  const rawGroups: { label: string; items: NavItem[] }[] = [
    {
      label: 'Work',
      items: [
        { href: '/', label: 'Today', Icon: IconOrders },
        { href: '/orders', label: 'Orders', Icon: IconOrders, count: openOrders },
        { href: '/clients', label: 'Clients', Icon: IconUsers, count: clientDocs.length },
        { href: '/settings/measurements', label: 'Measurements', Icon: IconRuler, feature: 'measurements' },
        { href: '/catalogue', label: 'Catalogue', Icon: IconTag, feature: 'catalogue' },
        { href: '/collections', label: 'Collections', Icon: IconLayers, feature: 'collections' },
        { href: '/suppliers', label: 'Suppliers', Icon: IconTruck, feature: 'suppliers' },
        { href: '/materials', label: 'Materials', Icon: IconSpool, feature: 'suppliers' },
        { href: '/inventory', label: 'Inventory', Icon: IconBox, feature: 'inventory' },
        { href: '/production', label: 'Production', Icon: IconFactory, feature: 'production' },
        { href: '/garment-units', label: 'Garment identity', Icon: IconFingerprint, feature: 'garment_identity' },
      ],
    },
    {
      label: 'Money',
      items: [
        { href: '/sales', label: 'Sales', Icon: IconMoney, feature: 'sales' },
        { href: '/expenses', label: 'Expenses', Icon: IconMoney, feature: 'expenses' },
        { href: '/reports', label: 'Reports', Icon: IconMoney },
      ],
    },
    {
      label: 'Shop',
      items: [
        { href: '/settings/staff', label: 'Staff', Icon: IconUsers },
        { href: '/settings', label: 'Settings', Icon: IconSettings },
      ],
    },
  ]

  const groups = rawGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.feature && !flags[item.feature]) return false
        if (item.href === '/reports' && !canViewReports) return false
        return true
      }),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <nav
      aria-label="Sections"
      class="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface p-2"
    >
      <a
        href="/orders/new"
        class={cn(
          'mb-3 flex h-[30px] items-center justify-center gap-1.5 bg-accent font-semibold',
          'text-accent-content hover:brightness-110',
          RADIUS,
          TEXT_SM,
        )}
      >
        <IconPlus size={13} />
        New order
      </a>

      {groups.map((group) => (
        <div key={group.label} class="mb-3">
          <p
            class={cn(
              'mb-1 px-2 font-semibold uppercase tracking-[0.08em] text-content-subtle',
              TEXT_XS,
            )}
          >
            {group.label}
          </p>
          {group.items.map((item) => {
            const active = isActive(path, item.href)
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                class={cn(
                  'flex h-[27px] items-center gap-2.5 px-2 font-medium',
                  RADIUS,
                  TEXT_SM,
                  active
                    ? 'bg-accent-soft font-semibold text-accent-on-soft'
                    : 'text-content-muted hover:bg-hover hover:text-content',
                )}
              >
                {item.Icon && <item.Icon size={14} />}
                <span class="truncate">{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    class={cn(
                      'ml-auto tabular-nums',
                      TEXT_XS,
                      active ? 'text-accent-on-soft' : 'text-content-subtle',
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </a>
            )
          })}
        </div>
      ))}

      {/* Sync sits at the foot of the nav rather than in the app bar: it is a
          property of this device, not of the page you are on, and the phone
          build makes the same call for the same reason. */}
      <div class={cn('mt-auto px-2 py-1.5', TEXT_XS)}>
        <SyncBadge online={online} auth={auth} replication={replication} />
      </div>
    </nav>
  )
}
