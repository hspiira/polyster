/**
 * Orders, in the web design: the whole book, with a record open beside it.
 *
 * The information architecture differs from the phone's on purpose (spec W6).
 * The phone opens on Today, because someone at a counter holding fabric asks
 * "what do I owe people". This opens on the table, because someone at a desk
 * asks "show me the book" -- and then wants to sort it, filter it, select
 * several rows and act on them.
 *
 * Selecting a row opens it in the inspector rather than navigating, so checking
 * a record never costs you your place in the list. That is the single thing the
 * phone design cannot do and the reason this screen exists.
 *
 * Derivation is shared with the phone build, not reimplemented: the scopes come
 * from todayModel's buckets, so "overdue" cannot mean two different things in
 * two designs.
 */
import { useMemo, useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances } from '../db/balances'
import { formatMinor } from '../lib/money'
import { dueBucket, formatDueDate, today } from '../lib/dates'
import { STAGE_LABELS, STAGE_TONES } from '../screens/orderStage'
import {
  OPEN_STAGES,
  buildBuckets,
  pickupRows,
  type DueRow,
} from '../screens/today/todayModel'
import { Chip, EmptyState } from '../ui'
import { IconOrders } from '../components/icons'
import { cn } from '../lib/cn'
import { Page, PageTab } from './Page'
import { Table, type TableColumn } from './Table'
import { Inspector } from './Inspector'
import { CONTROL_SM, RADIUS, TEXT_SM } from './chrome'

type Scope = 'open' | 'overdue' | 'ready' | 'owing' | 'all'

const SCOPES: readonly { value: Scope; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'ready', label: 'Ready' },
  { value: 'owing', label: 'Owing' },
  { value: 'all', label: 'All' },
]

type SortColumn = 'summary' | 'client' | 'due' | 'owed'

/** Enough that a shop rarely pages, few enough that the table never stalls. */
const PAGE_SIZE = 25

function Pager({
  children,
  label,
  current = false,
  disabled = false,
  onClick,
}: {
  children: preact.ComponentChildren
  label: string
  current?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      class={cn(
        'grid size-[22px] place-items-center rounded border text-[11px] disabled:opacity-40',
        current
          ? 'border-accent bg-accent font-semibold text-accent-content'
          : 'border-line-strong bg-surface text-content-muted hover:text-content',
      )}
    >
      {children}
    </button>
  )
}

export function OrdersPage() {
  const { db, shop } = useCurrentShop()
  const location = useLocation()
  const now = today()

  const [scope, setScope] = useState<Scope>('open')
  const [rawPageIndex, setPageIndex] = useState(0)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [sort, setSort] = useState<{ column: SortColumn; direction: 'asc' | 'desc' }>({
    column: 'due',
    direction: 'asc',
  })

  const openId = new URLSearchParams(location.query as Record<string, string>).get('open')

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
    if (scope === 'overdue') {
      return buildBuckets(orders, clientNames, balances, now).overdue
    }
    const all = pickupRows(orders, clientNames, balances)
    if (scope === 'open') return all.filter((row) => OPEN_STAGES.includes(row.order.stage))
    if (scope === 'ready') return all.filter((row) => row.order.stage === 'ready')
    if (scope === 'owing') return all.filter((row) => row.outstanding_minor > 0)
    return all
  }, [orders, clientNames, balances, scope, now])

  const sorted = useMemo(() => {
    const factor = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      switch (sort.column) {
        case 'summary':
          return factor * a.order.summary.localeCompare(b.order.summary)
        case 'client':
          return factor * a.clientName.localeCompare(b.clientName)
        case 'owed':
          return factor * (a.outstanding_minor - b.outstanding_minor)
        case 'due':
          return factor * a.dueDate.localeCompare(b.dueDate)
      }
    })
  }, [rows, sort])

  // Clamped rather than reset on every change, so re-sorting keeps your place
  // but narrowing the filter cannot strand you on a page that no longer exists.
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageIndex = Math.min(rawPageIndex, pageCount - 1)
  const firstOnPage = pageIndex * PAGE_SIZE
  const page = useMemo(
    () => sorted.slice(firstOnPage, firstOnPage + PAGE_SIZE),
    [sorted, firstOnPage],
  )

  // Selection is by order id and survives a scope change only where the row
  // still exists -- a bulk action must never touch a row you cannot see.
  const visibleIds = useMemo(() => new Set(sorted.map((row) => row.order.id)), [sorted])
  const activeSelection = useMemo(
    () => new Set([...selected].filter((id) => visibleIds.has(id))),
    [selected, visibleIds],
  )

  const openRow = useMemo(
    () => sorted.find((row) => row.order.id === openId) ?? sorted[0] ?? null,
    [sorted, openId],
  )

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function reorder(column: string) {
    const next = column as SortColumn
    setSort((current) =>
      current.column === next
        ? { column: next, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column: next, direction: 'asc' },
    )
  }

  const columns: TableColumn<DueRow>[] = [
    {
      id: 'summary',
      label: 'Order',
      width: 'minmax(8rem, 2.4fr)',
      sortable: true,
      render: (row) => (
        <span class="font-semibold">
          {row.order.summary}
          {row.kind === 'return' && <span class="font-normal text-content-subtle"> · return</span>}
        </span>
      ),
    },
    {
      id: 'client',
      label: 'Client',
      width: 'minmax(6rem, 1.5fr)',
      sortable: true,
      render: (row) => row.clientName,
    },
    {
      id: 'stage',
      label: 'Stage',
      width: '5.75rem',
      render: (row) => (
        <Chip tone={STAGE_TONES[row.order.stage]}>{STAGE_LABELS[row.order.stage]}</Chip>
      ),
    },
    {
      id: 'due',
      label: 'Due',
      width: '5.5rem',
      sortable: true,
      render: (row) => {
        const late = dueBucket(row.dueDate, now) === 'overdue'
        return (
          <span class={cn(late && 'font-semibold text-danger')}>{formatDueDate(row.dueDate)}</span>
        )
      },
    },
    {
      id: 'owed',
      label: 'Owed',
      width: '6rem',
      align: 'end',
      sortable: true,
      render: (row) =>
        row.outstanding_minor > 0 ? (
          <span class="font-semibold text-money">
            {formatMinor(row.outstanding_minor, shop.currency)}
          </span>
        ) : (
          <span class="text-content-subtle">Paid</span>
        ),
    },
  ]

  return (
    // `panes` makes this a container: the record pane divides the screen while
    // there is room for both and overlays it below that (styles/components.css).
    <div class="panes flex min-h-0 flex-1">
      <Page
        crumbs={['Work']}
        title="Orders"
        tabs={
          <>
            <PageTab selected>All orders</PageTab>
            <PageTab>Due this week</PageTab>
            <PageTab>Out on rental</PageTab>
          </>
        }
        viewbar={
          <>
            {SCOPES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={scope === option.value}
                onClick={() => setScope(option.value)}
                class={cn(
                  'border px-2.5 font-medium',
                  CONTROL_SM,
                  RADIUS,
                  TEXT_SM,
                  scope === option.value
                    ? 'border-accent bg-accent text-accent-content'
                    : 'border-line-strong bg-surface text-content-muted hover:border-content-muted hover:text-content',
                )}
              >
                {option.label}
              </button>
            ))}
            <span class="mx-1 h-4 w-px bg-line-strong" />
            {/* Present because the layout must reserve them -- controls added
                after a table is built always end up somewhere they do not fit.
                Disabled rather than dead: they say what they will do. */}
            {(['Filter', 'Columns', 'Export'] as const).map((label) => (
              <button
                key={label}
                type="button"
                disabled
                title="Not built yet"
                class={cn(
                  'border border-line-strong bg-surface px-2.5 font-medium text-content-muted',
                  'disabled:opacity-45',
                  CONTROL_SM,
                  RADIUS,
                  TEXT_SM,
                )}
              >
                {label}
              </button>
            ))}
            <span class="flex-1" />
            <span class="text-[11.5px] text-content-subtle tabular-nums">
              {sorted.length} {sorted.length === 1 ? 'order' : 'orders'}
            </span>
          </>
        }
      >
        {activeSelection.size > 0 && (
          <div
            class={cn(
              'mb-2 flex items-center gap-2.5 bg-accent-soft px-2.5 py-1.5 font-semibold',
              'text-accent-on-soft',
              RADIUS,
              TEXT_SM,
            )}
          >
            {activeSelection.size} selected
            <span class="flex-1" />
            <button type="button" class="font-medium underline underline-offset-2">
              Mark ready
            </button>
            <button type="button" class="font-medium underline underline-offset-2">
              Send update
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              class="font-medium underline underline-offset-2"
            >
              Clear
            </button>
          </div>
        )}

        <Table
          label="Orders"
          items={page}
          columns={columns}
          getKey={(row) => row.order.id}
          href={(row) => `/orders?open=${row.order.id}`}
          selected={activeSelection}
          onToggleSelect={toggle}
          sort={sort}
          onSort={reorder}
          empty={
            <EmptyState
              illustration={<IconOrders size={22} />}
              title="Nothing here"
              description="No order matches this filter. Try another, or take a new order."
            />
          }
          footer={
            <>
              <span class="tabular-nums">
                {sorted.length === 0
                  ? 'None'
                  : `${firstOnPage + 1}–${Math.min(firstOnPage + PAGE_SIZE, sorted.length)} of ${sorted.length}`}
              </span>
              <span class="flex-1" />
              {pageCount > 1 && (
                <span class="flex gap-1">
                  <Pager label="Previous" disabled={pageIndex === 0} onClick={() => setPageIndex(pageIndex - 1)}>
                    ‹
                  </Pager>
                  {Array.from({ length: pageCount }, (_, index) => (
                    <Pager
                      key={index}
                      label={`Page ${index + 1}`}
                      current={index === pageIndex}
                      onClick={() => setPageIndex(index)}
                    >
                      {index + 1}
                    </Pager>
                  ))}
                  <Pager
                    label="Next"
                    disabled={pageIndex >= pageCount - 1}
                    onClick={() => setPageIndex(pageIndex + 1)}
                  >
                    ›
                  </Pager>
                </span>
              )}
            </>
          }
        />
      </Page>

      <Inspector
        row={openRow}
        chosen={Boolean(openId)}
        onClose={() => location.route('/orders')}
      />
    </div>
  )
}
