/**
 * Today: what needs doing, and what is owed.
 *
 * The in-app replacement for push notifications (ARCHITECTURE.md D5), so every
 * figure is a reactive local query. All derivation lives in todayModel.ts.
 */
import { useMemo } from 'preact/hooks'
import {
  AccentRow,
  Button,
  Chip,
  EmptyState,
  MoreLink,
  Screen,
  SectionCard,
  Skeleton,
  StatValue,
} from '../../components/ui'
import { IconPlus } from '../../components/icons'
import { IllustrationOrders } from '../../components/illustrations'
import { useCurrentShop } from '../../state/ShopProvider'
import { useRxQuery, useRxQueryStatus } from '../../hooks/useRxQuery'
import { observeShopBalances } from '../../db/balances'
import { formatMinor } from '../../lib/money'
import { formatDueDate, today } from '../../lib/dates'
import { STAGE_LABELS, STAGE_TONES } from '../orderStage'
import type { FilterScope } from '../Orders'
import type { AuthState } from '../../lib/auth'
import type { ReplicationStatus } from '../../hooks/useReplication'
import { Hero } from './Hero'
import { DayStrip } from './DayStrip'
import { ProfileHeader } from './ProfileHeader'
import {
  buildBuckets,
  buildDayStrip,
  buildMoneySummary,
  capRows,
  heroSegments,
  type DueRow,
} from './todayModel'

/** Rows shown per bucket before the "See all" link takes over. */
const ROW_CAP = 4

interface TodayProps {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}

export function Today({ online, auth, replication }: TodayProps) {
  const { db, shop, activeStaff } = useCurrentShop()
  const now = today()
  const greetingText = greeting(activeStaff?.name)
  const firstName = activeStaff?.name.split(/\s+/)[0]

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
  const cells = useMemo(() => buildDayStrip(orders, now), [orders, now])
  const money = useMemo(
    () => buildMoneySummary(orders, clientNames, balances),
    [orders, clientNames, balances],
  )

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
        <ProfileHeader
          name={firstName}
          greeting={greetingText}
          shopName={shop.name}
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
    // An order belongs to a client, so offering to take one before any client
    // exists sends the owner to a form that immediately turns them away. On a
    // brand-new shop the first step is the client, and this says so.
    const needsClientFirst = clientCount === 0

    return (
      <Screen label="Today">
        <ProfileHeader
          name={firstName}
          greeting={greetingText}
          shopName={shop.name}
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

  return (
    <Screen label="Today">
      <ProfileHeader
        name={firstName}
        greeting={greetingText}
        shopName={shop.name}
        online={online}
        auth={auth}
        replication={replication}
      />
      <Hero segments={segments} />
      <DayStrip cells={cells} />

      <div class="space-y-4">
        <Bucket title="Overdue" tone="bad" filter="overdue" rows={buckets.overdue} />
        <Bucket title="Due today" tone="warn" filter="today" rows={buckets.dueToday} />
        <Bucket title="Due this week" tone="neutral" filter="week" rows={buckets.dueThisWeek} />

        {buckets.outOnRental.length > 0 && (
          <Bucket
            title="Out on rental"
            tone="info"
            filter="out"
            rows={buckets.outOnRental}
          />
        )}

        {money.outstanding_minor > 0 && (
          <SectionCard
            title="Owed to you"
            subtitle={`across ${money.clientCount} ${money.clientCount === 1 ? 'client' : 'clients'}`}
            footer={<MoreLink href="/reports">See reports</MoreLink>}
          >
            <div class="px-4 pb-3">
              <StatValue value={formatMinor(money.outstanding_minor, shop.currency)} tone="money" />
            </div>
            <ul>
              {money.rows.map((row) => (
                <li key={row.order.id}>
                  <AccentRow
                    href={`/orders/${row.order.id}`}
                    tone="warn"
                    trailing={
                      <span class="text-sm font-semibold text-amber-700 dark:text-amber-400">
                        {formatMinor(row.outstanding_minor, row.order.currency)}
                      </span>
                    }
                  >
                    <span class="block truncate font-medium">{row.clientName}</span>
                    <span class="block truncate text-sm text-stone-500 dark:text-stone-400">
                      {row.order.summary}
                      {row.collected && ' · collected'}
                    </span>
                  </AccentRow>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    </Screen>
  )
}

function greeting(name: string | undefined, now: Date = new Date()): string {
  const hour = now.getHours()
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name.split(/\s+/)[0]}` : part
}

function Bucket({
  title,
  tone,
  filter,
  rows,
}: {
  title: string
  tone: 'bad' | 'warn' | 'neutral' | 'info'
  filter: FilterScope
  rows: DueRow[]
}) {
  if (rows.length === 0) return null

  const { rows: shown, hidden } = capRows(rows, ROW_CAP)

  return (
    <SectionCard
      title={title}
      count={rows.length}
      footer={
        hidden > 0 ? (
          <MoreLink href={`/orders?filter=${filter}`}>See all {rows.length}</MoreLink>
        ) : undefined
      }
    >
      <ul>
        {shown.map((row) => (
          <li key={`${row.order.id}-${row.kind}`}>
            <AccentRow
              href={`/orders/${row.order.id}`}
              tone={tone}
              trailing={<Chip tone={STAGE_TONES[row.order.stage]}>{STAGE_LABELS[row.order.stage]}</Chip>}
            >
              <span class="block truncate font-medium">
                {row.order.summary}
                {row.kind === 'return' && (
                  <span class="font-normal text-stone-500 dark:text-stone-400"> · return</span>
                )}
              </span>
              <span class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-stone-500 dark:text-stone-400">
                <span class="truncate">{row.clientName}</span>
                <span aria-hidden="true">·</span>
                <span class={tone === 'bad' ? 'text-red-600 dark:text-red-400' : ''}>
                  {formatDueDate(row.dueDate)}
                </span>
                {row.outstanding_minor > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span class="text-amber-700 dark:text-amber-400">
                      {formatMinor(row.outstanding_minor, row.order.currency)} due
                    </span>
                  </>
                )}
              </span>
            </AccentRow>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
