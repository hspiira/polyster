/* What needs doing, and what is owed. The in-app replacement for push (D5), so
   every figure is a reactive local query. Derivation is in todayModel.ts. */
import { useMemo } from 'preact/hooks'
import { Avatar, Button, EmptyState, FLUSH_SURFACE_FLAT, MoreLink, Screen, Skeleton } from '../../components/ui'
import { IconPlus } from '../../components/icons'
import { IllustrationOrders } from '../../components/illustrations'
import { ShopPrompts } from '../../components/ShopPrompts'
import { useCurrentShop } from '../../state/ShopProvider'
import { useRxQuery, useRxQueryStatus } from '../../hooks/useRxQuery'
import { observeShopBalances } from '../../db/balances'
import { formatMinor } from '../../lib/money'
import { today } from '../../lib/dates'
import type { AuthState } from '../../lib/auth'
import type { ReplicationStatus } from '../../hooks/useReplication'
import { Hero } from './Hero'
import { TodayTop } from './TodayTop'
import { DayStrip } from './DayStrip'
import { DueList, type DueSection } from './DueList'
import {
  buildBuckets,
  buildDayStrip,
  buildMoneySummary,
  heroSegments,
} from './todayModel'

interface TodayProps {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}

export function Today({ online, auth, replication }: TodayProps) {
  const { db, shop, activeStaff } = useCurrentShop()
  const now = today()

  // Only the count matters, and only on the empty state -- which branch of it
  // to show. See the comment there.
  const clientCount = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  ).length

  const { value: orderDocs, loaded } = useRxQueryStatus(
    () => db.orders.find({ selector: { shop_id: shop.id }, sort: [{ pickup_due_date: 'asc' }] }).$,
    [db, shop.id],
    [],
  )
  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const balances = useRxQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())

  const orders = useMemo(() => orderDocs.map((doc) => doc.toJSON()), [orderDocs])
  const clientNames = useMemo(
    () => new Map(clientDocs.map((doc) => [doc.id, doc.name])),
    [clientDocs],
  )

  const buckets = useMemo(
    () => buildBuckets(orders, clientNames, balances, now),
    [orders, clientNames, balances, now],
  )
  const money = useMemo(
    () => buildMoneySummary(orders, clientNames, balances),
    [orders, clientNames, balances],
  )
  const dayCells = useMemo(() => buildDayStrip(orders, now), [orders, now])

  const segments = heroSegments({
    late: buckets.overdue.length,
    dueToday: buckets.dueToday.length,
    dueThisWeek: buckets.dueThisWeek.length,
    outstanding_minor: money.outstanding_minor,
    currency: shop.currency,
  })

  if (!loaded) {
    return (
      <Screen label="Today">
        <TodayTop
          date={now}
          staffName={activeStaff?.name}
          online={online}
          auth={auth}
          replication={replication}
        />
        <div class="space-y-5">
          <Skeleton class="h-16 w-3/4" />
          <Skeleton class="h-16 w-full" />
          <Skeleton class="h-32 w-full" />
        </div>
      </Screen>
    )
  }

  if (orders.length === 0) {
    // An order belongs to a client, so offering one before any client exists
    // sends the owner to a form that turns them away.
    const needsClientFirst = clientCount === 0

    return (
      <Screen label="Today">
        <TodayTop
          date={now}
          staffName={activeStaff?.name}
          online={online}
          auth={auth}
          replication={replication}
        />
        <EmptyState
          spacious
          illustration={<IllustrationOrders size={128} />}
          title="Nothing on yet"
          description={
            needsClientFirst
              ? 'Add the client you are sewing for, then take their order. What is due and what is owed shows up here.'
              : 'Once you take an order, what is due and what is owed shows up here.'
          }
          action={
            needsClientFirst ? (
              <Button linkTo="/clients">
                <IconPlus size={18} /> Add your first client
              </Button>
            ) : (
              <Button linkTo="/orders/new">
                <IconPlus size={18} /> Take the first order
              </Button>
            )
          }
        />
      </Screen>
    )
  }

  const sections: DueSection[] = [
    { title: 'Overdue', tone: 'danger', filter: 'overdue', rows: buckets.overdue },
    { title: 'Due today', tone: 'money', filter: 'today', rows: buckets.dueToday },
    { title: 'Due this week', tone: 'neutral', filter: 'week', rows: buckets.dueThisWeek },
    { title: 'Out on rental', tone: 'accent', filter: 'out', rows: buckets.outOnRental },
  ]

  return (
    <Screen label="Today" wide>
      <TodayTop
        date={now}
        staffName={activeStaff?.name}
        online={online}
        auth={auth}
        replication={replication}
      />
      <DayStrip cells={dayCells} />
      <Hero segments={segments} />
      <ShopPrompts />

      {/* One column on a phone, two up on a desktop. */}
      <div class="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        <DueList sections={sections} />

        {money.outstanding_minor > 0 && (
          /* No headline figure: the hero sentence already gives the total. */
          <section class={FLUSH_SURFACE_FLAT}>
            <h2 class="flex items-center gap-2 px-gutter pt-3 pb-1.5">
              <span class="size-1.5 shrink-0 rounded-full bg-money" aria-hidden="true" />
              <span class="text-[13px] font-semibold">Owed to you</span>
              <span class="text-[13px] text-content-muted">
                {money.clientCount} {money.clientCount === 1 ? 'client' : 'clients'}
              </span>
            </h2>
            <ul>
              {money.rows.map((row) => (
                <li key={row.order.id}>
                  <a
                    href={`/orders/${row.order.id}`}
                    class="flex min-h-tap items-center gap-3 px-gutter py-2 transition-colors
                           hover:bg-hover active:bg-pressed"
                  >
                    <Avatar name={row.clientName} size="sm" />
                    <span class="min-w-0 flex-1">
                      <span class="flex items-baseline gap-2">
                        <span class="min-w-0 flex-1 truncate text-[15px] font-medium">
                          {row.clientName}
                        </span>
                        <span class="shrink-0 text-[13px] font-semibold tabular-nums text-money">
                          {formatMinor(row.outstanding_minor, row.order.currency)}
                        </span>
                      </span>
                      <span class="mt-0.5 block truncate text-[13px] text-content-muted">
                        {row.order.summary}
                        {row.collected && ' · collected'}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <MoreLink href="/reports">See reports</MoreLink>
          </section>
        )}
      </div>
    </Screen>
  )
}
