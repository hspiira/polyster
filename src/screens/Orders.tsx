/**
 * The order list (Phase 1 step 5), and one of Book's two sections.
 *
 * Defaults to open work. A shop's list of everything ever made grows forever
 * and is almost never the question being asked on the shop floor -- "what is
 * outstanding" is.
 *
 * ## The scope lives in the URL, not in local state
 *
 * Today links here four ways -- `?filter=overdue|today|week|out` from a
 * bucket's "See all", and `?due=YYYY-MM-DD` from a day-strip cell. While the
 * scope was `useState('open')` every one of those links silently landed on
 * Open, so a shop tapping "See all 6 overdue" got a different list with no
 * indication anything had been ignored. Reading it from the URL also makes the
 * back button behave: changing a segment is a navigation, so backing out of a
 * filter returns to the previous one.
 *
 * Due-based scopes reuse `todayModel`'s bucketing rather than re-deriving it.
 * Two implementations of "overdue" would drift, and the first symptom would be
 * a card saying 6 opening a list of 5.
 */
import { useMemo } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import {
  Card,
  Chip,
  EmptyState,
  ListRow,
  RowList,
  Screen,
  Segmented,
} from '../components/ui'
import { IllustrationOrders } from '../components/illustrations'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances } from '../db/balances'
import { formatMinor } from '../lib/money'
import { dueBucket, formatDate, formatDueDate, today } from '../lib/dates'
import { STAGE_LABELS, STAGE_TONES } from './orderStage'
import {
  OPEN_STAGES,
  buildBuckets,
  pickupRows,
  rowsDueOn,
  type DueRow,
} from './today/todayModel'

/** Scopes the segmented control offers. */
type Segment = 'open' | 'overdue' | 'ready' | 'owing' | 'all'

/**
 * Scopes only reachable by link, from Today. They are not segments: eight
 * segments would be unreadable at 390px, and `Segmented` documents five as its
 * ceiling. They render as a context bar with a way back to the segments.
 */
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

  const rows = useMemo(() => {
    if (typeof scope === 'object') {
      return rowsDueOn(orders, clientNames, balances, scope.due)
    }

    if (scope === 'overdue' || scope === 'today' || scope === 'week' || scope === 'out') {
      const buckets = buildBuckets(orders, clientNames, balances, now)
      if (scope === 'overdue') return buckets.overdue
      if (scope === 'today') return buckets.dueToday
      if (scope === 'week') return buckets.dueThisWeek
      return buckets.outOnRental
    }

    const all = pickupRows(orders, clientNames, balances)
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
  }, [orders, clientNames, balances, scope, now])

  return (
    <Screen label="Orders">
      <div class="space-y-4">
        {isSegment(scope) ? (
          <Segmented
            value={scope}
            options={SEGMENTS}
            onChange={(value) => location.route(`/orders?filter=${value}`)}
            label="Filter orders"
          />
        ) : (
          <ScopeBar label={scopeLabel(scope)} count={rows.length} />
        )}

        {rows.length === 0 ? (
          <EmptyState
            spacious
            illustration={<IllustrationOrders size={112} />}
            title={emptyTitle(scope)}
            description={emptyDescription(scope)}
          />
        ) : (
          <Card padded={false}>
            <RowList>
              {rows.map((row) => (
                <li key={`${row.order.id}-${row.kind}`}>
                  <OrderRow row={row} />
                </li>
              ))}
            </RowList>
          </Card>
        )}
      </div>
    </Screen>
  )
}

/** What a linked scope is showing, and the way back to the segments. */
function ScopeBar({ label, count }: { label: string; count: number }) {
  return (
    <div class="flex items-center justify-between gap-3 rounded-card bg-white px-4 py-2.5 dark:bg-stone-900">
      <p class="min-w-0 truncate text-sm">
        <span class="font-semibold">{label}</span>
        <span class="text-stone-500 dark:text-stone-400"> · {count}</span>
      </p>
      <a
        href="/orders"
        class="-mr-2 flex min-h-9 shrink-0 items-center rounded-control px-2 text-xs
               font-semibold text-brand-700 active:bg-stone-100 dark:text-brand-300
               dark:active:bg-stone-800"
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

function OrderRow({ row }: { row: DueRow }) {
  const { order } = row
  // A return row is overdue on its own date even though the order has been
  // picked up, which is exactly the case that used to be invisible (finding T1).
  const stillDue = row.kind === 'return' || (order.stage !== 'picked_up' && order.stage !== 'returned')
  const overdue = stillDue && dueBucket(row.dueDate) === 'overdue'

  return (
    <ListRow
      href={`/orders/${order.id}`}
      trailing={<Chip tone={STAGE_TONES[order.stage]}>{STAGE_LABELS[order.stage]}</Chip>}
    >
      <span class="block truncate font-medium">
        {order.summary}
        {row.kind === 'return' && (
          <span class="font-normal text-stone-500 dark:text-stone-400"> · return</span>
        )}
      </span>
      <span class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-stone-500 dark:text-stone-400">
        <span class="truncate">{row.clientName}</span>
        <span aria-hidden="true">·</span>
        <span class={overdue ? 'font-medium text-red-600 dark:text-red-400' : ''}>
          {formatDueDate(row.dueDate)}
        </span>
        {row.outstanding_minor > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span class="font-medium text-amber-700 dark:text-amber-400">
              {formatMinor(row.outstanding_minor, order.currency)} due
            </span>
          </>
        )}
      </span>
    </ListRow>
  )
}
