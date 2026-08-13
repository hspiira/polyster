/* A destination here rather than the opening screen, so it answers a wider
   question in columns. Every figure comes from todayModel, as the phone's does. */
import { useMemo } from 'preact/hooks'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances } from '../db/balances'
import { formatMinor } from '../lib/money'
import { formatDueDate, today } from '../lib/dates'
import { STAGE_LABELS, STAGE_TONES } from '../screens/orderStage'
import { buildBuckets, buildMoneySummary, type DueRow } from '../screens/today/todayModel'
import { ShopPrompts } from '../components/ShopPrompts'
import { Chip } from '../ui'
import { cn } from '../lib/cn'
import { Page } from './Page'
import { RADIUS, TEXT_SM, TEXT_XS } from './chrome'

export function TodayPage() {
  const { db, shop } = useCurrentShop()
  const now = today()

  const orderDocs = useRxQuery(
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

  return (
    <Page crumbs={['Work']} title="Today">
      <div class="flex min-h-0 flex-1 flex-col gap-3">
        <ShopPrompts />

        <div class="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2.5">
          <Stat label="Late" value={String(buckets.overdue.length)} tone={buckets.overdue.length > 0 ? 'danger' : undefined} />
          <Stat label="Due today" value={String(buckets.dueToday.length)} />
          <Stat label="Due this week" value={String(buckets.dueThisWeek.length)} />
          <Stat
            label={`Owed by ${money.clientCount} ${money.clientCount === 1 ? 'client' : 'clients'}`}
            value={formatMinor(money.outstanding_minor, shop.currency)}
            tone={money.outstanding_minor > 0 ? 'money' : undefined}
          />
        </div>

        {/* Three columns, not three stacked cards. The phone stacks because it
            has one column; stacking here would waste the screen that is the
            reason this design exists. */}
        <div class="grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] items-start gap-2.5">
          <Bucket title="Overdue" rows={buckets.overdue} tone="danger" />
          <Bucket title="Due today" rows={buckets.dueToday} tone="money" />
          <Bucket title="Due this week" rows={buckets.dueThisWeek} />
          {buckets.outOnRental.length > 0 && (
            <Bucket title="Out on rental" rows={buckets.outOnRental} tone="accent" />
          )}
        </div>
      </div>
    </Page>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'danger' | 'money'
}) {
  return (
    <div class={cn('bg-surface px-3 py-2.5', RADIUS)}>
      <p class={cn('text-content-muted', TEXT_XS)}>{label}</p>
      <p
        class={cn(
          'mt-0.5 text-[20px] font-semibold leading-none tracking-tight tabular-nums',
          tone === 'danger' && 'text-danger',
          tone === 'money' && 'text-money',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function Bucket({
  title,
  rows,
  tone,
}: {
  title: string
  rows: readonly DueRow[]
  tone?: 'danger' | 'money' | 'accent'
}) {
  return (
    <section class={cn('flex max-h-full min-h-0 flex-col overflow-hidden bg-surface', RADIUS)}>
      <h2
        class={cn(
          'flex shrink-0 items-baseline gap-1.5 px-3 pb-1.5 pt-2.5 font-semibold',
          TEXT_SM,
        )}
      >
        <span
          class={cn(
            'inline-block size-1.5 rounded-full',
            tone === 'danger' && 'bg-danger',
            tone === 'money' && 'bg-money',
            tone === 'accent' && 'bg-accent',
            !tone && 'bg-line-strong',
          )}
          aria-hidden="true"
        />
        {title}
        <span class={cn('font-normal text-content-subtle', TEXT_XS)}>{rows.length}</span>
      </h2>

      {rows.length === 0 ? (
        <p class={cn('px-3 pb-3 text-content-subtle', TEXT_XS)}>Nothing here.</p>
      ) : (
        <ul class="min-h-0 overflow-y-auto pb-1">
          {rows.map((row) => (
            <li key={`${row.order.id}-${row.kind}`}>
              <a
                href={`/orders?open=${row.order.id}`}
                class="flex items-center gap-2 px-3 py-1.5 hover:bg-hover"
              >
                <span class="min-w-0 flex-1">
                  <span class={cn('block truncate font-medium', TEXT_SM)}>
                    {row.order.summary}
                    {row.kind === 'return' && (
                      <span class="font-normal text-content-subtle"> · return</span>
                    )}
                  </span>
                  <span class={cn('block truncate text-content-muted', TEXT_XS)}>
                    {row.clientName} · {formatDueDate(row.dueDate)}
                  </span>
                </span>
                <Chip tone={STAGE_TONES[row.order.stage]}>{STAGE_LABELS[row.order.stage]}</Chip>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
