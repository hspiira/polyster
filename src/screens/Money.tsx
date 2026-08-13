/** The money tab: what came in, what went out, and what is still owed. */
import { useMemo, useState } from 'preact/hooks'
import {
  AccentRow,
  Button,
  Card,
  CurrencySwitch,
  EmptyState,
  FLUSH_SURFACE,
  InfoNote,
  PeriodBar,
  PeriodRangeFields,
  Screen,
  Sections,
  Skeleton,
  StatValue,
  cn,
} from '../ui'
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronRight,
  IconMoney,
  IconPlus,
} from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery, useRxQueryStatus } from '../hooks/useRxQuery'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import { usePermission } from '../hooks/usePermission'
import { usePeriod } from '../hooks/usePeriod'
import { useReportCurrency } from '../hooks/useReportCurrency'
import { observeShopBalances } from '../db/balances'
import { profitAndLoss } from '../db/profit'
import { formatAmount } from '../lib/money'
import { formatPastDay, today } from '../lib/dates'
import { AddExpenseSheet } from './ExpenseSheet'
import { useMoneySections } from './moneySections'
import { buildMoneyFeed, type MoneyEntry } from './moneyFeed'

const FEED_LIMIT = 8

export function Money() {
  const { db, shop } = useCurrentShop()
  const flags = useFeatureFlags(db, shop.id)
  const canAddExpense = usePermission('expenses.create')
  const sections = useMoneySections()
  const period = usePeriod('7')
  const [adding, setAdding] = useState(false)

  const now = today()

  const { value: orderDocs, loaded } = useRxQueryStatus(
    () => db.orders.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const paymentDocs = useRxQuery(() => db.payments.find().$, [db], [])
  const saleDocs = useRxQuery(
    () => db.sales.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const expenseDocs = useRxQuery(
    () => db.expenses.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const balances = useRxQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())

  const orders = useMemo(() => orderDocs.map((doc) => doc.toJSON()), [orderDocs])
  const clientNames = useMemo(
    () => new Map(clientDocs.map((doc) => [doc.id, doc.name])),
    [clientDocs],
  )
  const orderIndex = useMemo(
    () =>
      new Map(
        orders.map((order) => [
          order.id,
          { currency: order.currency, clientName: clientNames.get(order.client_id) },
        ]),
      ),
    [orders, clientNames],
  )

  const allSales = useMemo(() => saleDocs.map((doc) => doc.toJSON()), [saleDocs])
  const allExpenses = useMemo(() => expenseDocs.map((doc) => doc.toJSON()), [expenseDocs])

  const { currency, options: currencies, setCurrency } = useReportCurrency(shop.currency, [
    ...allSales.map((sale) => sale.currency),
    ...allExpenses.map((expense) => expense.currency),
    ...orders.map((order) => order.currency),
  ])

  // One currency per report: minor units of two currencies cannot be added.
  const sales = useMemo(
    () => allSales.filter((sale) => sale.currency === currency),
    [allSales, currency],
  )
  const expenses = useMemo(
    () => allExpenses.filter((expense) => expense.currency === currency),
    [allExpenses, currency],
  )

  /**
   * A payment carries no shop_id -- it hangs off an order -- so it is scoped
   * through one, which also settles which currency it was taken in.
   */
  const payments = useMemo(
    () =>
      paymentDocs
        .map((doc) => doc.toJSON())
        .filter((payment) => orderIndex.get(payment.order_id)?.currency === currency),
    [paymentDocs, orderIndex, currency],
  )

  const pnl = useMemo(
    () => profitAndLoss({ sales, payments, expenses, from: period.from, to: period.to }),
    [sales, payments, expenses, period.from, period.to],
  )

  const feed = useMemo(
    () =>
      buildMoneyFeed({
        sales,
        payments,
        expenses,
        orders: orderIndex,
        fallbackCurrency: currency,
        from: period.from,
        to: period.to,
      }),
    [sales, payments, expenses, orderIndex, currency, period.from, period.to],
  )

  const outstanding = useMemo(() => {
    const cancelled = new Set(
      orders.filter((order) => order.stage === 'cancelled').map((order) => order.id),
    )
    let total = 0
    let count = 0
    for (const [orderId, balance] of balances) {
      if (balance.balance_minor <= 0 || cancelled.has(orderId)) continue
      if (orderIndex.get(orderId)?.currency !== currency) continue
      total += balance.balance_minor
      count += 1
    }
    return { total, count }
  }, [balances, orders, orderIndex, currency])

  const canRecordSale = flags.sales
  const canRecordExpense = flags.expenses && canAddExpense

  const actions = (canRecordSale || canRecordExpense) && (
    <div class="flex gap-3">
      {canRecordSale && (
        <Button class="flex-1" linkTo="/sales/new">
          <IconPlus size={18} /> Record sale
        </Button>
      )}
      {canRecordExpense && (
        <Button class="flex-1" variant="secondary" onClick={() => setAdding(true)}>
          <IconPlus size={18} /> Add expense
        </Button>
      )}
    </div>
  )

  if (!loaded) {
    return (
      <Screen label="Money" sections={sections}>
        <div class="space-y-4">
          <Skeleton class="h-9 w-full" />
          <Skeleton class="h-40 w-full" />
          <Skeleton class="h-32 w-full" />
        </div>
      </Screen>
    )
  }

  if (sales.length === 0 && expenses.length === 0 && payments.length === 0) {
    return (
      <Screen label="Money" sections={sections}>
        <EmptyState
          spacious
          illustration={<IconMoney size={56} />}
          title="No money recorded yet"
          description="Take a payment on an order, ring up a counter sale, or note what the shop spent. This page then shows what came in, what went out, and what you actually made."
          action={actions || undefined}
        />
        <AddExpenseSheet open={adding} onClose={() => setAdding(false)} />
      </Screen>
    )
  }

  const inProfit = pnl.profitMinor >= 0
  const gross = pnl.incomeMinor + pnl.expensesMinor

  return (
    <Screen label="Money" sections={sections}>
      <Sections>
        <div>
          <div class="flex items-center justify-between gap-3">
            <PeriodBar value={period.key} onChange={period.setKey} />
            <CurrencySwitch value={currency} options={currencies} onChange={setCurrency} />
          </div>
          {period.key === 'custom' && (
            <PeriodRangeFields
              range={{ from: period.from, to: period.to }}
              onChange={period.setRange}
            />
          )}
        </div>

        <Card flush>
          <p class="text-sm text-content-muted">
            {inProfit ? 'Profit' : 'Loss'}, {period.label}
          </p>
          <div class="mt-1">
            <StatValue
              value={formatAmount(pnl.profitMinor, currency)}
              tone={gross === 0 ? 'neutral' : inProfit ? 'success' : 'danger'}
            />
          </div>

          <FlowBar inMinor={pnl.incomeMinor} outMinor={pnl.expensesMinor} />

          <dl class="mt-3 grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-3">
            <FlowLeg
              label="Money in"
              dot="bg-success"
              value={formatAmount(pnl.incomeMinor, currency)}
            />
            <FlowLeg
              label="Money out"
              dot="bg-danger"
              value={`-${formatAmount(pnl.expensesMinor, currency)}`}
              tone="text-danger"
            />
          </dl>

          {gross === 0 && (
            <p class="mt-3 text-sm text-content-muted">Nothing recorded in this period.</p>
          )}
          {pnl.expensesMinor === 0 && pnl.incomeMinor > 0 && (
            <p class="mt-3 text-sm text-money">
              No expenses recorded, so this is income rather than profit.
            </p>
          )}
        </Card>

        {actions}

        {outstanding.total > 0 && (
          <section class={FLUSH_SURFACE}>
            <AccentRow
              href="/orders"
              tone="money"
              trailing={<IconChevronRight size={18} class="text-content-subtle" />}
            >
              <span class="flex items-baseline justify-between gap-3">
                <span class="text-[15px] font-medium">Owed to you</span>
                <span class="text-heading font-semibold tabular-nums text-money">
                  {formatAmount(outstanding.total, currency)}
                </span>
              </span>
              <span class="mt-0.5 block text-xs text-content-muted">
                Across {outstanding.count} {outstanding.count === 1 ? 'order' : 'orders'} · not yet
                paid, so not in the figures above
              </span>
            </AccentRow>
          </section>
        )}

        {feed.length > 0 && (
          <section class={FLUSH_SURFACE}>
            <h2 class="flex items-baseline gap-1.5 px-gutter pt-3 pb-1 text-heading font-semibold">
              Activity
              <span class="text-xs font-normal text-content-muted">{feed.length}</span>
            </h2>
            <ul class="pb-1">
              {feed.slice(0, FEED_LIMIT).map((entry) => (
                <li key={entry.id}>
                  <FeedRow entry={entry} now={now} />
                </li>
              ))}
            </ul>
            {feed.length > FEED_LIMIT && (
              <p class="px-gutter pt-1 pb-3 text-xs text-content-muted">
                Showing the latest {FEED_LIMIT} of {feed.length}.
              </p>
            )}
          </section>
        )}

        <InfoNote>
          Figures come from what is on this device, and count money that actually moved. If it has
          not synced recently, another device's latest payments may not be counted yet.
        </InfoNote>
      </Sections>

      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} />
    </Screen>
  )
}

function FlowBar({ inMinor, outMinor }: { inMinor: number; outMinor: number }) {
  const gross = inMinor + outMinor
  if (gross === 0) return <div class="mt-4 h-2 rounded-pill bg-surface-sunken" />

  return (
    <div
      class="mt-4 flex h-2 gap-px overflow-hidden rounded-pill bg-surface-sunken"
      aria-hidden="true"
    >
      <div class="bg-success" style={{ width: `${(inMinor / gross) * 100}%` }} />
      <div class="flex-1 bg-danger" />
    </div>
  )
}

function FlowLeg({
  label,
  value,
  dot,
  tone,
}: {
  label: string
  value: string
  dot: string
  tone?: string
}) {
  return (
    <div>
      <dt class="flex items-center gap-1.5 text-xs font-medium text-content-muted">
        <span class={cn('size-1.5 shrink-0 rounded-full', dot)} aria-hidden="true" />
        {label}
      </dt>
      <dd class={cn('mt-0.5 text-[15px] font-semibold tabular-nums', tone)}>{value}</dd>
    </div>
  )
}

function FeedRow({ entry, now }: { entry: MoneyEntry; now: string }) {
  const incoming = entry.direction === 'in'

  return (
    <a
      href={entry.href}
      class="flex min-h-tap items-center gap-3 px-gutter py-2.5 transition-colors
             hover:bg-hover active:bg-pressed"
    >
      <span
        class={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-[0.65rem]',
          incoming ? 'bg-success-soft text-success-on-soft' : 'bg-neutral-soft text-neutral-on-soft',
        )}
      >
        {incoming ? <IconArrowDown size={16} /> : <IconArrowUp size={16} />}
      </span>
      <span class="min-w-0 flex-1">
        <span class="flex items-baseline gap-2">
          <span class="min-w-0 flex-1 truncate text-[15px] font-medium">{entry.title}</span>
          <span
            class={cn('shrink-0 text-sm font-semibold tabular-nums', incoming && 'text-success')}
          >
            {incoming ? '+' : '−'}
            {formatAmount(entry.amountMinor, entry.currency)}
          </span>
        </span>
        <span class="mt-0.5 block truncate text-xs text-content-muted">
          {formatPastDay(entry.day, now)} · {entry.meta}
        </span>
      </span>
    </a>
  )
}
