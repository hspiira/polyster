/* The reference screen for the redesign: one ORDER_COLUMNS, one DataList, no
   colour named. Scope lives in the URL, so Today's links and back both work. */
import { useMemo } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import {
  Chip,
  DataList,
  EmptyState,
  Screen,
  TabRow,
  type Column,
} from '../ui'
import { IllustrationOrders } from '../components/illustrations'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances } from '../db/balances'
import { formatMinor } from '../lib/money'
import { dueBucket, formatDate, formatDueDate, today } from '../lib/dates'
import { ORDER_TYPE_ICONS, ORDER_TYPE_LABELS, STAGE_LABELS, STAGE_TONES } from './orderStage'
import { cn } from '../lib/cn'
import { normalizeTone, TONE_SOFT } from '../ui/tones'
import { OPEN_STAGES } from '../db/schema'
import {
  buildBuckets,
  pickupRows,
  rowsDueOn,
  type DueRow,
} from './today/todayModel'

/** Scopes the tab row offers. */
type Segment = 'open' | 'overdue' | 'ready' | 'owing' | 'all'

/* Scopes reachable only by link from Today. Eight counted tabs would not fit a
   phone, so these render as a context bar with a way back. */
type LinkedScope = 'today' | 'week' | 'out'

type Scope = Segment | LinkedScope | { due: string }

/** The `filter=` values Orders accepts (a `due=` link uses a different param). */
export type FilterScope = Segment | LinkedScope

const SEGMENTS: readonly { value: Segment; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'ready', label: 'Ready' },
  { value: 'owing', label: 'Owing' },
  { value: 'all', label: 'All' },
]

const SEGMENT_VALUES = SEGMENTS.map((segment) => segment.value)
const LINKED_SCOPES: readonly LinkedScope[] = ['today', 'week', 'out']

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Unrecognised parameters fall back to Open rather than showing nothing. */
function readScope(query: Record<string, string>): Scope {
  const params = new URLSearchParams(query)

  const due = params.get('due')
  if (due && ISO_DATE.test(due)) return { due }

  const filter = params.get('filter')
  if (filter && (SEGMENT_VALUES as readonly string[]).includes(filter)) return filter as Segment
  if (filter && (LINKED_SCOPES as readonly string[]).includes(filter)) return filter as LinkedScope

  return 'open'
}

function isSegment(scope: Scope): scope is Segment {
  return typeof scope === 'string' && (SEGMENT_VALUES as readonly string[]).includes(scope)
}

/* Late, and still someone's problem. A return row is overdue on its own date
   even though the order has been picked up. */
function isOverdue(row: DueRow): boolean {
  const stillDue =
    row.kind === 'return' ||
    (row.order.stage !== 'picked_up' && row.order.stage !== 'returned')
  return stillDue && dueBucket(row.dueDate) === 'overdue'
}

/** One description of an order row, for both presentations. See ui/DataList.tsx. */
const ORDER_COLUMNS: readonly Column<DueRow>[] = [
  {
    id: 'order',
    label: 'Order',
    role: 'primary',
    render: (row) => (
      <>
        <span class="block truncate">
          {row.order.summary}
          {row.kind === 'return' && (
            <span class="font-normal text-content-muted"> · return</span>
          )}
        </span>
        <span
          class="mt-0.5 hidden truncate text-xs font-normal text-content-subtle
                 @[44rem]/data-list:block"
        >
          {row.order.reference}
        </span>
      </>
    ),
  },
  {
    id: 'client',
    label: 'Client',
    render: (row) => row.clientName,
  },
  {
    id: 'type',
    label: 'Type',
    wideOnly: true,
    render: (row) => ORDER_TYPE_LABELS[row.order.order_type],
  },
  {
    id: 'due',
    label: 'Due',
    // Relative ("in 3 days") on a phone -- the shop-floor question is how long
    // there is, not what the date is. The table form has room for both.
    render: (row) => (
      <span class={isOverdue(row) ? 'font-medium text-danger' : undefined}>
        {formatDueDate(row.dueDate)}
        <span class="ml-1.5 hidden text-content-subtle @[44rem]/data-list:inline">
          {formatDate(row.dueDate)}
        </span>
      </span>
    ),
  },
  {
    id: 'stage',
    label: 'Stage',
    role: 'status',
    render: (row) => (
      <>
        <span class="text-[13px] text-content-muted @[44rem]/data-list:hidden">
          {STAGE_LABELS[row.order.stage]}
        </span>
        <span class="hidden @[44rem]/data-list:inline">
          <Chip tone={STAGE_TONES[row.order.stage]}>{STAGE_LABELS[row.order.stage]}</Chip>
        </span>
      </>
    ),
  },
  {
    id: 'outstanding',
    label: 'Outstanding',
    role: 'figure',
    srLabel: 'Outstanding',
    render: (row) =>
      row.outstanding_minor > 0 ? (
        <span class="text-money">
          {formatMinor(row.outstanding_minor, row.order.currency)}
        </span>
      ) : (
        <span class="hidden font-normal text-content-subtle @[44rem]/data-list:inline">--</span>
      ),
  },
]

export function Orders() {
  const { db, shop } = useCurrentShop()
  const location = useLocation()
  const now = today()

  const scope = readScope(location.query as Record<string, string>)

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

  // Shared by the list and the tab counts, computed once: two derivations of
  // "overdue" drift, and the symptom is a tab saying 6 opening a list of 5.
  const all = useMemo(() => pickupRows(orders, clientNames, balances), [orders, clientNames, balances])
  const buckets = useMemo(
    () => buildBuckets(orders, clientNames, balances, now),
    [orders, clientNames, balances, now],
  )

  const rows = useMemo(() => {
    if (typeof scope === 'object') {
      return rowsDueOn(orders, clientNames, balances, scope.due)
    }

    if (scope === 'overdue') return buckets.overdue
    if (scope === 'today') return buckets.dueToday
    if (scope === 'week') return buckets.dueThisWeek
    if (scope === 'out') return buckets.outOnRental

    switch (scope) {
      case 'open':
        return all.filter((row) => OPEN_STAGES.includes(row.order.stage))
      case 'ready':
        return all.filter((row) => row.order.stage === 'ready')
      case 'owing':
        return all.filter((row) => row.outstanding_minor > 0)
      case 'all':
        // Furthest-due first: reverses the pickup_due_date-ascending sort,
        // not creation order.
        return [...all].reverse()
    }
  }, [orders, clientNames, balances, scope, all, buckets])

  const segmentCounts: Record<Segment, number> = useMemo(
    () => ({
      open: all.filter((row) => OPEN_STAGES.includes(row.order.stage)).length,
      overdue: buckets.overdue.length,
      ready: all.filter((row) => row.order.stage === 'ready').length,
      owing: all.filter((row) => row.outstanding_minor > 0).length,
      all: all.length,
    }),
    [all, buckets],
  )

  return (
    <Screen
      label="Orders"
      width="wide"
      subheader={
        isSegment(scope) ? (
          <TabRow
            value={scope}
            options={SEGMENTS.map((segment) => ({
              ...segment,
              count: segmentCounts[segment.value],
            }))}
            onChange={(value) => location.route(`/orders?filter=${value}`)}
            label="Filter orders"
          />
        ) : (
          <ScopeBar label={scopeLabel(scope)} count={rows.length} />
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          spacious
          illustration={<IllustrationOrders size={112} />}
          title={emptyTitle(scope)}
          description={emptyDescription(scope)}
        />
      ) : (
        <DataList
          label="Orders"
          items={rows}
          columns={ORDER_COLUMNS}
          getKey={(row) => `${row.order.id}-${row.kind}`}
          href={(row) => `/orders/${row.order.id}`}
          leading={(row) => <OrderTypeTile row={row} />}
        />
      )}
    </Screen>
  )
}

/** Type as shape, stage as colour. The same tile Today's list uses. */
function OrderTypeTile({ row }: { row: DueRow }) {
  const TypeIcon = ORDER_TYPE_ICONS[row.order.order_type]
  return (
    <span
      class={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-[0.65rem]',
        TONE_SOFT[normalizeTone(STAGE_TONES[row.order.stage])],
      )}
    >
      <TypeIcon size={16} />
      <span class="sr-only">{ORDER_TYPE_LABELS[row.order.order_type]}</span>
    </span>
  )
}

/** What a linked scope is showing, and the way back to the segments. */
function ScopeBar({ label, count }: { label: string; count: number }) {
  return (
    <div class="flex items-center justify-between gap-3 rounded-control bg-surface-sunken px-4 py-2.5">
      <p class="min-w-0 truncate text-sm">
        <span class="font-semibold">{label}</span>
        <span class="text-content-muted"> · {count}</span>
      </p>
      <a
        href="/orders"
        class="-mr-2 flex min-h-9 shrink-0 items-center rounded-control px-2 text-xs
               font-semibold text-accent transition-colors hover:bg-hover"
      >
        Clear
      </a>
    </div>
  )
}

function scopeLabel(scope: Exclude<Scope, Segment>): string {
  if (typeof scope === 'object') return `Due ${formatDate(scope.due)}`
  if (scope === 'today') return 'Due today'
  if (scope === 'week') return 'Due this week'
  return 'Out on rental'
}

function emptyTitle(scope: Scope): string {
  if (typeof scope === 'object') return 'Nothing due that day'
  switch (scope) {
    case 'open':
      return 'No open orders'
    case 'overdue':
      return 'Nothing overdue'
    case 'owing':
      return 'Everything is paid'
    case 'ready':
      return 'Nothing waiting for collection'
    case 'today':
      return 'Nothing due today'
    case 'week':
      return 'Nothing due this week'
    case 'out':
      return 'Nothing out on rental'
    case 'all':
      return 'No orders yet'
  }
}

function emptyDescription(scope: Scope): string {
  if (typeof scope === 'object') return 'No pickups or returns fall on that date.'
  switch (scope) {
    case 'open':
      return 'Everything is picked up or returned. Switch the filter to see finished work.'
    case 'overdue':
      return 'Every open order is still within its due date.'
    case 'owing':
      return 'No order has an outstanding balance.'
    case 'ready':
      return 'Nothing is finished and waiting for a client right now.'
    case 'today':
      return 'Nothing is due out or back today.'
    case 'week':
      return 'Nothing falls in the next seven days.'
    case 'out':
      return 'Every rental is back in the shop.'
    case 'all':
      return 'Take an order and it will appear here.'
  }
}
