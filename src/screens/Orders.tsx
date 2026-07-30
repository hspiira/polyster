/**
 * The order list (Phase 1 step 5).
 *
 * Defaults to open work. A shop's list of everything ever made grows forever
 * and is almost never the question being asked on the shop floor -- "what is
 * outstanding" is.
 */
import { useMemo, useState } from 'preact/hooks'
import {
  Card,
  Chip,
  EmptyState,
  Fab,
  ListRow,
  RowList,
  Screen,
  Segmented,
} from '../components/ui'
import { IconOrders, IconPlus } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances } from '../db/balances'
import { formatMoney } from '../lib/money'
import { dueBucket, formatDueDate } from '../lib/dates'
import { STAGE_LABELS, STAGE_TONES } from './orderStage'
import type { OrderDoc, OrderStage } from '../db/schema'

type Filter = 'open' | 'ready' | 'overdue' | 'owing' | 'all'

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'ready', label: 'Ready' },
  { value: 'owing', label: 'Owing' },
  { value: 'all', label: 'All' },
]

/** Stages that still need something doing. */
const OPEN_STAGES: readonly OrderStage[] = ['measured', 'in_progress', 'ready']

export function Orders() {
  const { db, shop } = useCurrentShop()
  const [filter, setFilter] = useState<Filter>('open')

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

  const clientNames = useMemo(
    () => new Map(clientDocs.map((doc) => [doc.id, doc.name])),
    [clientDocs],
  )

  const orders = useMemo(() => {
    const all = orderDocs.map((doc) => doc.toJSON())
    switch (filter) {
      case 'all':
        return all
      case 'open':
        return all.filter((o) => OPEN_STAGES.includes(o.stage))
      case 'ready':
        return all.filter((o) => o.stage === 'ready')
      case 'overdue':
        return all.filter(
          (o) => OPEN_STAGES.includes(o.stage) && dueBucket(o.pickup_due_date) === 'overdue',
        )
      case 'owing':
        return all.filter((o) => (balances.get(o.id)?.balance ?? 0) > 0)
    }
  }, [orderDocs, filter, balances])

  return (
    <>
      <Screen title="Orders">
        <div class="space-y-4">
          <Segmented value={filter} options={FILTERS} onChange={setFilter} label="Filter orders" />

          {orders.length === 0 ? (
            <Card padded={false}>
              <EmptyState
                icon={<IconOrders size={26} />}
                title={emptyTitle(filter)}
                description={emptyDescription(filter)}
              />
            </Card>
          ) : (
            <Card padded={false}>
              <RowList>
                {orders.map((order) => (
                  <li key={order.id}>
                    <OrderRow
                      order={order}
                      clientName={clientNames.get(order.client_id)}
                      outstanding={balances.get(order.id)?.balance ?? 0}
                    />
                  </li>
                ))}
              </RowList>
            </Card>
          )}
        </div>
      </Screen>

      <Fab href="/orders/new" label="New order" icon={<IconPlus size={24} />} />
    </>
  )
}

function emptyTitle(filter: Filter): string {
  if (filter === 'open') return 'No open orders'
  if (filter === 'overdue') return 'Nothing overdue'
  if (filter === 'owing') return 'Everything is paid'
  if (filter === 'ready') return 'Nothing waiting for collection'
  return 'No orders yet'
}

function emptyDescription(filter: Filter): string {
  if (filter === 'open') {
    return 'Everything is picked up or returned. Switch the filter to see finished work.'
  }
  if (filter === 'overdue') return 'Every open order is still within its due date.'
  if (filter === 'owing') return 'No order has an outstanding balance.'
  if (filter === 'ready') return 'Nothing is finished and waiting for a client right now.'
  return 'Take an order and it will appear here.'
}

function OrderRow({
  order,
  clientName,
  outstanding,
}: {
  order: OrderDoc
  clientName: string | undefined
  outstanding: number
}) {
  const stillDue = order.stage !== 'picked_up' && order.stage !== 'returned'
  const overdue = stillDue && dueBucket(order.pickup_due_date) === 'overdue'

  return (
    <ListRow
      href={`/orders/${order.id}`}
      trailing={<Chip tone={STAGE_TONES[order.stage]}>{STAGE_LABELS[order.stage]}</Chip>}
    >
      <span class="block truncate font-medium">{order.item_description}</span>
      <span class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-stone-500 dark:text-stone-400">
        <span class="truncate">{clientName ?? 'Unknown client'}</span>
        <span aria-hidden="true">·</span>
        <span class={overdue ? 'font-medium text-red-600 dark:text-red-400' : ''}>
          {formatDueDate(order.pickup_due_date)}
        </span>
      </span>
      {outstanding > 0 && (
        <span class="mt-0.5 block text-sm font-medium text-amber-700 dark:text-amber-400">
          {formatMoney(outstanding)} outstanding
        </span>
      )}
    </ListRow>
  )
}
