/**
 * The dashboard (Phase 1 step 7).
 *
 * This is the in-app replacement for push notifications, decided in
 * ARCHITECTURE.md D5. It has to answer "what needs doing today" from local
 * data alone, with no network and no notification permission -- so every
 * figure here is a reactive RxDB query over already-replicated rows.
 *
 * Sections are ordered by urgency, and empty ones are hidden. A shop opening
 * this at 8am should see work, not a wall of zeroes.
 */
import { useMemo } from 'preact/hooks'
import { Button, Card, Chip, EmptyState, ListRow, Screen } from '../components/ui'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances, type OrderBalance } from '../db/balances'
import { formatMoney } from '../lib/money'
import { dueBucket, formatDueDate, today } from '../lib/dates'
import { STAGE_LABELS, STAGE_TONES } from './orderStage'
import type { OrderDoc, OrderStage } from '../db/schema'

/** Stages that still need something doing. Finished work is not "due". */
const OPEN_STAGES: readonly OrderStage[] = ['measured', 'in_progress', 'ready']

export function Dashboard() {
  const { db, shop } = useCurrentShop()
  const now = today()

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

  const balances = useRxQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())

  const clientNames = useMemo(
    () => new Map(clientDocs.map((doc) => [doc.id, doc.name])),
    [clientDocs],
  )

  const orders = useMemo(() => orderDocs.map((doc) => doc.toJSON()), [orderDocs])
  const open = useMemo(() => orders.filter((o) => OPEN_STAGES.includes(o.stage)), [orders])

  const overdue = open.filter((o) => dueBucket(o.pickup_due_date, now) === 'overdue')
  const dueToday = open.filter((o) => dueBucket(o.pickup_due_date, now) === 'today')
  const dueThisWeek = open.filter((o) => dueBucket(o.pickup_due_date, now) === 'this_week')

  // Money owed on work that is finished. An outstanding balance on an order
  // still being made is normal; one on a garment the client already collected
  // is the thing a shop chases.
  const unpaidCollected = useMemo(
    () =>
      orders
        .filter((o) => !OPEN_STAGES.includes(o.stage))
        .map((o) => ({ order: o, balance: balances.get(o.id) }))
        .filter((row): row is { order: OrderDoc; balance: OrderBalance } =>
          Boolean(row.balance && row.balance.balance > 0),
        ),
    [orders, balances],
  )

  const totalOutstanding = useMemo(
    () =>
      Array.from(balances.values())
        .filter((b) => b.balance > 0)
        .reduce((sum, b) => sum + b.balance, 0),
    [balances],
  )

  const stageCounts = useMemo(() => {
    const counts = new Map<OrderStage, number>()
    for (const order of open) counts.set(order.stage, (counts.get(order.stage) ?? 0) + 1)
    return counts
  }, [open])

  if (orders.length === 0) {
    return (
      <Screen title="Today">
        <EmptyState
          title="Nothing on yet"
          description="Once you take an order, what is due and what is owed shows up here."
          action={
            <a href="/orders/new">
              <Button>Take the first order</Button>
            </a>
          }
        />
      </Screen>
    )
  }

  return (
    <Screen title="Today">
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <Stat label="Open orders" value={String(open.length)} />
          <Stat
            label="Outstanding"
            value={formatMoney(totalOutstanding)}
            tone={totalOutstanding > 0 ? 'warn' : 'good'}
          />
        </div>

        {stageCounts.size > 0 && (
          <Card>
            <h2 class="mb-2 text-sm font-medium text-gray-700">Work in hand</h2>
            <ul class="flex flex-wrap gap-2">
              {[...stageCounts].map(([stage, count]) => (
                <li key={stage}>
                  <Chip tone={STAGE_TONES[stage]}>
                    {count} {STAGE_LABELS[stage].toLowerCase()}
                  </Chip>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Section
          title="Overdue"
          tone="bad"
          orders={overdue}
          clientNames={clientNames}
          balances={balances}
        />
        <Section
          title="Due today"
          tone="warn"
          orders={dueToday}
          clientNames={clientNames}
          balances={balances}
        />
        <Section
          title="Due this week"
          orders={dueThisWeek}
          clientNames={clientNames}
          balances={balances}
        />

        {unpaidCollected.length > 0 && (
          <section class="space-y-2">
            <h2 class="text-sm font-medium text-red-700">Collected but not fully paid</h2>
            <Card class="!p-0">
              <ul class="px-3">
                {unpaidCollected.map(({ order, balance }) => (
                  <li key={order.id}>
                    <ListRow href={`/orders/${order.id}`}>
                      <span class="min-w-0">
                        <span class="block truncate font-medium text-gray-900">
                          {order.item_description}
                        </span>
                        <span class="block text-sm text-gray-500">
                          {clientNames.get(order.client_id) ?? 'Unknown client'}
                        </span>
                      </span>
                      <span class="shrink-0 text-sm text-red-700">
                        {formatMoney(balance.balance)}
                      </span>
                    </ListRow>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}

        {overdue.length === 0 && dueToday.length === 0 && dueThisWeek.length === 0 && (
          <Card>
            <p class="text-sm text-gray-600">
              Nothing due in the next week. {open.length > 0 && 'Work in hand is all further out.'}
            </p>
          </Card>
        )}

        <a href="/reports" class="block">
          <Button variant="secondary" class="w-full">
            See reports
          </Button>
        </a>
      </div>
    </Screen>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  const colours = {
    good: 'text-green-700',
    warn: 'text-amber-700',
  } as const

  return (
    <Card>
      <p class="text-xs text-gray-500">{label}</p>
      <p class={`mt-1 text-xl font-semibold ${tone ? colours[tone] : 'text-gray-900'}`}>{value}</p>
    </Card>
  )
}

function Section({
  title,
  tone,
  orders,
  clientNames,
  balances,
}: {
  title: string
  tone?: 'bad' | 'warn'
  orders: OrderDoc[]
  clientNames: Map<string, string>
  balances: Map<string, OrderBalance>
}) {
  if (orders.length === 0) return null

  const headings = {
    bad: 'text-red-700',
    warn: 'text-amber-700',
  } as const

  return (
    <section class="space-y-2">
      <h2 class={`text-sm font-medium ${tone ? headings[tone] : 'text-gray-700'}`}>
        {title} ({orders.length})
      </h2>
      <Card class="!p-0">
        <ul class="px-3">
          {orders.map((order) => {
            const outstanding = balances.get(order.id)?.balance ?? 0
            return (
              <li key={order.id}>
                <ListRow href={`/orders/${order.id}`}>
                  <span class="min-w-0">
                    <span class="block truncate font-medium text-gray-900">
                      {order.item_description}
                    </span>
                    <span class="block truncate text-sm text-gray-500">
                      {clientNames.get(order.client_id) ?? 'Unknown client'} ·{' '}
                      {formatDueDate(order.pickup_due_date)}
                      {outstanding > 0 && ` · ${formatMoney(outstanding)} due`}
                    </span>
                  </span>
                  <Chip tone={STAGE_TONES[order.stage]}>{STAGE_LABELS[order.stage]}</Chip>
                </ListRow>
              </li>
            )
          })}
        </ul>
      </Card>
    </section>
  )
}
