/**
 * The dashboard (Phase 1 step 7).
 *
 * The in-app replacement for push notifications (ARCHITECTURE.md D5). It has
 * to answer "what needs doing today" from local data alone, so every figure is
 * a reactive RxDB query over already-replicated rows.
 *
 * Sections are ordered by urgency and empty ones are hidden. A shop opening
 * this at 8am should see work, not a wall of zeroes.
 */
import { useMemo } from 'preact/hooks'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ListRow,
  RowList,
  Screen,
  SectionTitle,
} from '../components/ui'
import { IconAlert, IconClock, IconMoney, IconOrders, IconPlus } from '../components/icons'
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
  const orders = useMemo(() => orderDocs.map((doc) => doc.toJSON()), [orderDocs])
  const open = useMemo(() => orders.filter((o) => OPEN_STAGES.includes(o.stage)), [orders])

  const overdue = open.filter((o) => dueBucket(o.pickup_due_date, now) === 'overdue')
  const dueToday = open.filter((o) => dueBucket(o.pickup_due_date, now) === 'today')
  const dueThisWeek = open.filter((o) => dueBucket(o.pickup_due_date, now) === 'this_week')

  // Money owed on finished work. An outstanding balance on a garment still
  // being made is normal; one on a garment already collected is what a shop
  // chases.
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
      [...balances.values()].filter((b) => b.balance > 0).reduce((sum, b) => sum + b.balance, 0),
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
        <Card padded={false}>
          <EmptyState
            icon={<IconOrders size={26} />}
            title="Nothing on yet"
            description="Once you take an order, what is due and what is owed shows up here."
            action={
              <a href="/orders/new">
                <Button>
                  <IconPlus size={18} /> Take the first order
                </Button>
              </a>
            }
          />
        </Card>
      </Screen>
    )
  }

  return (
    <Screen title="Today" subtitle={greeting()}>
      <div class="space-y-5">
        <div class="grid grid-cols-2 gap-3">
          <Stat
            icon={<IconOrders size={16} />}
            label="Open orders"
            value={String(open.length)}
          />
          <Stat
            icon={<IconMoney size={16} />}
            label="Outstanding"
            value={formatMoney(totalOutstanding)}
            emphasis={totalOutstanding > 0}
          />
        </div>

        {stageCounts.size > 0 && (
          <div class="flex flex-wrap gap-2">
            {[...stageCounts].map(([stage, count]) => (
              <Chip key={stage} tone={STAGE_TONES[stage]}>
                {count} {STAGE_LABELS[stage].toLowerCase()}
              </Chip>
            ))}
          </div>
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
          <section>
            <SectionTitle>Collected, still owing</SectionTitle>
            <Card padded={false}>
              <RowList>
                {unpaidCollected.map(({ order, balance }) => (
                  <li key={order.id}>
                    <ListRow
                      href={`/orders/${order.id}`}
                      trailing={
                        <span class="shrink-0 text-sm font-semibold text-amber-700 dark:text-amber-400">
                          {formatMoney(balance.balance)}
                        </span>
                      }
                    >
                      <span class="block truncate font-medium">{order.item_description}</span>
                      <span class="block truncate text-sm text-stone-500 dark:text-stone-400">
                        {clientNames.get(order.client_id) ?? 'Unknown client'}
                      </span>
                    </ListRow>
                  </li>
                ))}
              </RowList>
            </Card>
          </section>
        )}

        {overdue.length === 0 && dueToday.length === 0 && dueThisWeek.length === 0 && (
          <Card>
            <div class="flex items-center gap-3">
              <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                <IconClock size={20} />
              </span>
              <p class="text-sm text-stone-600 dark:text-stone-300">
                Nothing due in the next week.
                {open.length > 0 && ' Work in hand is all further out.'}
              </p>
            </div>
          </Card>
        )}

        <a href="/reports" class="block">
          <Button variant="secondary" block>
            See reports
          </Button>
        </a>
      </div>
    </Screen>
  )
}

function greeting(now: Date = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function Stat({
  icon,
  label,
  value,
  emphasis,
}: {
  icon: preact.ComponentChildren
  label: string
  value: string
  emphasis?: boolean
}) {
  return (
    <Card>
      <p class="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
        {icon}
        {label}
      </p>
      {/* Bolder and bigger than a typical card stat, closer to the
          weight a fitness app gives "144bpm" -- the outstanding figure
          is the one number on this screen a shop actually needs at a
          glance, so it should not compete with its own label for
          attention. */}
      <p
        class={`mt-1.5 text-3xl font-semibold leading-none tabular-nums tracking-tight ${
          emphasis ? 'text-amber-700 dark:text-amber-400' : ''
        }`}
      >
        {value}
      </p>
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

  return (
    <section>
      <SectionTitle
        action={
          tone === 'bad' ? (
            <span class="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
              <IconAlert size={14} />
              {orders.length}
            </span>
          ) : (
            <span class="text-xs text-stone-400">{orders.length}</span>
          )
        }
      >
        {title}
      </SectionTitle>

      <Card padded={false}>
        <RowList>
          {orders.map((order) => {
            const outstanding = balances.get(order.id)?.balance ?? 0
            return (
              <li key={order.id}>
                <ListRow
                  href={`/orders/${order.id}`}
                  trailing={<Chip tone={STAGE_TONES[order.stage]}>{STAGE_LABELS[order.stage]}</Chip>}
                >
                  <span class="block truncate font-medium">{order.item_description}</span>
                  <span class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-stone-500 dark:text-stone-400">
                    <span class="truncate">
                      {clientNames.get(order.client_id) ?? 'Unknown client'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span class={tone === 'bad' ? 'text-red-600 dark:text-red-400' : ''}>
                      {formatDueDate(order.pickup_due_date)}
                    </span>
                    {outstanding > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span class="text-amber-700 dark:text-amber-400">
                          {formatMoney(outstanding)} due
                        </span>
                      </>
                    )}
                  </span>
                </ListRow>
              </li>
            )
          })}
        </RowList>
      </Card>
    </section>
  )
}
