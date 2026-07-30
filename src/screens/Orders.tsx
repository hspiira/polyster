/**
 * The order list (Phase 1 step 5).
 *
 * Defaults to open work only. A shop's list of everything ever made grows
 * forever and is almost never what someone wants on the shop floor -- the
 * question is "what is outstanding", so that is what opens.
 */
import { useMemo, useState } from 'preact/hooks'
import { Button, Card, Chip, EmptyState, ListRow, Screen, Select } from '../components/ui'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances } from '../db/balances'
import { formatMoney } from '../lib/money'
import { dueBucket, formatDueDate } from '../lib/dates'
import { STAGE_LABELS, STAGE_TONES } from './orderStage'
import type { OrderDoc, OrderStage } from '../db/schema'

type Filter = 'open' | 'all' | OrderStage

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Open work' },
  { value: 'measured', label: 'Measured' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'ready', label: 'Ready' },
  { value: 'picked_up', label: 'Picked up' },
  { value: 'returned', label: 'Returned' },
  { value: 'all', label: 'Everything' },
]

/** Stages that still need something doing. */
const OPEN_STAGES: readonly OrderStage[] = ['measured', 'in_progress', 'ready']

export function Orders() {
  const { db, shop } = useCurrentShop()
  const [filter, setFilter] = useState<Filter>('open')

  const orderDocs = useRxQuery(
    () =>
      db.orders.find({
        selector: { shop_id: shop.id },
        sort: [{ pickup_due_date: 'asc' }],
      }).$,
    [db, shop.id],
    [],
  )

  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )

  const balances = useRxQuery(
    () => observeShopBalances(db, shop.id),
    [db, shop.id],
    new Map(),
  )

  const clientNames = useMemo(
    () => new Map(clientDocs.map((doc) => [doc.id, doc.name])),
    [clientDocs],
  )

  const orders = useMemo(() => {
    const all = orderDocs.map((doc) => doc.toJSON())
    if (filter === 'all') return all
    if (filter === 'open') return all.filter((order) => OPEN_STAGES.includes(order.stage))
    return all.filter((order) => order.stage === filter)
  }, [orderDocs, filter])

  return (
    <Screen
      title="Orders"
      action={
        <a href="/orders/new">
          <Button class="px-3">New</Button>
        </a>
      }
    >
      <Select
        value={filter}
        onChange={(e) => setFilter((e.target as HTMLSelectElement).value as Filter)}
        class="mb-3"
        aria-label="Filter orders"
      >
        {FILTERS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      {orders.length === 0 ? (
        <EmptyState
          title={filter === 'open' ? 'No open orders' : 'Nothing here'}
          description={
            filter === 'open'
              ? 'Everything is picked up or returned. Take a new order, or switch the filter to see finished work.'
              : 'No orders match this filter.'
          }
          action={
            <a href="/orders/new">
              <Button>New order</Button>
            </a>
          }
        />
      ) : (
        <Card class="!p-0">
          <ul class="px-3">
            {orders.map((order) => (
              <li key={order.id}>
                <OrderRow
                  order={order}
                  clientName={clientNames.get(order.client_id)}
                  outstanding={balances.get(order.id)?.balance ?? order.price_total}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Screen>
  )
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
  const bucket = dueBucket(order.pickup_due_date)
  const stillDue = order.stage !== 'picked_up' && order.stage !== 'returned'

  return (
    <ListRow href={`/orders/${order.id}`}>
      <span class="min-w-0">
        <span class="block truncate font-medium text-gray-900">{order.item_description}</span>
        <span class="block truncate text-sm text-gray-500">
          {clientName ?? 'Unknown client'}
          {' · '}
          <span class={stillDue && bucket === 'overdue' ? 'text-red-600' : undefined}>
            due {formatDueDate(order.pickup_due_date)}
          </span>
        </span>
        {outstanding > 0 && (
          <span class="block text-sm text-amber-700">{formatMoney(outstanding)} outstanding</span>
        )}
      </span>
      <Chip tone={STAGE_TONES[order.stage]}>{STAGE_LABELS[order.stage]}</Chip>
    </ListRow>
  )
}
