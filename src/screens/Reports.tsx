/* Computed on the device from replicated rows, so it works offline and says so
   rather than presenting possibly-behind figures as fact. Cash accounting. */
import { useMemo, useState } from 'preact/hooks'
import {
  Avatar,
  Card,
  CurrencySwitch,
  DataRow,
  FlowColumns,
  FLUSH_SURFACE,
  PeriodBar,
  PeriodRangeFields,
  Screen,
  Sections,
  ShareBar,
  Sparkline,
  StatStrip,
  StatTile,
  StatValue,
} from '../ui'
import { IconChevronRight } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useQuery } from '../hooks/useQuery'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import { usePeriod } from '../hooks/usePeriod'
import { useReportCurrency } from '../hooks/useReportCurrency'
import { profitAndLoss } from '../db/profit'
import { customerLifetimeValues } from '../db/customerValue'
import { repairMetrics } from '../db/repairMetrics'
import { cashFlow, cumulativeNet } from './reportsModel'
import { useMoneySections } from './moneySections'
import { EXPENSE_CATEGORY_LABELS } from './expenseCategories'
import { formatAmount } from '../lib/money'
import { STAGE_LABELS, STAGE_TONES } from './orderStage'
import { ORDER_STAGES, type OrderStage } from '../db/schema'
import { observeClients, observeExpenses, observeOrders, observePayments, observeSales, observeShopBalances } from '../db/repo'

const TOP_CUSTOMERS = 5

/** Off the bench: no longer work, so they are reported as a footnote. */
const FINISHED_STAGES: readonly OrderStage[] = ['picked_up', 'returned', 'cancelled']

export function Reports() {
  const { db, shop } = useCurrentShop()
  const flags = useFeatureFlags(db, shop.id)
  const sections = useMoneySections()
  const period = usePeriod('30')
  const [picked, setPicked] = useState<number | null>(null)

  const orders = useQuery(() => observeOrders(db, shop.id), [db, shop.id], [])
  const paymentRows = useQuery(() => observePayments(db), [db], [])
  const allSales = useQuery(() => observeSales(db, shop.id), [db, shop.id], [])
  const allExpenses = useQuery(() => observeExpenses(db, shop.id), [db, shop.id], [])
  const clientRows = useQuery(() => observeClients(db, shop.id), [db, shop.id], [])
  const balances = useQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())


  const { currency, options: currencies, setCurrency } = useReportCurrency(shop.currency, [
    ...allSales.map((sale) => sale.currency),
    ...allExpenses.map((expense) => expense.currency),
    ...orders.map((order) => order.currency),
  ])

  // Minor units of two currencies cannot be added, so the report holds one.
  const sales = useMemo(
    () => allSales.filter((sale) => sale.currency === currency),
    [allSales, currency],
  )
  const expenses = useMemo(
    () => allExpenses.filter((expense) => expense.currency === currency),
    [allExpenses, currency],
  )
  const orderCurrencies = useMemo(
    () => new Map(orders.map((order) => [order.id, order.currency])),
    [orders],
  )

  /* A payment carries no shop_id, so it is scoped through its order: a handed-on
     device still holds the previous shop's rows until wiped. */
  const payments = useMemo(
    () =>
      paymentRows
        .filter((payment) => orderCurrencies.get(payment.order_id) === currency),
    [paymentRows, orderCurrencies, currency],
  )

  const pnl = useMemo(
    () => profitAndLoss({ sales, payments, expenses, from: period.from, to: period.to }),
    [sales, payments, expenses, period.from, period.to],
  )

  const buckets = useMemo(
    () => cashFlow({ sales, payments, expenses, from: period.from, to: period.to }),
    [sales, payments, expenses, period.from, period.to],
  )
  const running = useMemo(() => cumulativeNet(buckets), [buckets])

  const outstanding = useMemo(() => {
    // A cancelled order still carries a balance but is not chased for money.
    const cancelled = new Set(
      orders.filter((order) => order.stage === 'cancelled').map((order) => order.id),
    )
    let total = 0
    let count = 0
    for (const [orderId, balance] of balances) {
      if (balance.balance_minor <= 0 || cancelled.has(orderId)) continue
      if (orderCurrencies.get(orderId) !== currency) continue
      total += balance.balance_minor
      count += 1
    }
    return { total, count }
  }, [balances, orders, orderCurrencies, currency])

  /* Counts, not bars: a stage count is a share of nothing the reader can see.
     Workflow order, empty stages dropped, so no shop reads three zeroes. */
  const stages = useMemo(() => {
    const counts = new Map(ORDER_STAGES.map((stage) => [stage, 0]))
    for (const order of orders) counts.set(order.stage, (counts.get(order.stage) ?? 0) + 1)

    const rows = [...counts].filter(([, count]) => count > 0)
    return {
      work: rows.filter(([stage]) => !FINISHED_STAGES.includes(stage)),
      finished: rows.filter(([stage]) => FINISHED_STAGES.includes(stage)),
      workCount: rows
        .filter(([stage]) => !FINISHED_STAGES.includes(stage))
        .reduce((sum, [, count]) => sum + count, 0),
    }
  }, [orders])

  const topCustomers = useMemo(
    () =>
      customerLifetimeValues(
        clientRows,
        orders,
        payments,
        sales,
      ).slice(0, TOP_CUSTOMERS),
    [clientRows, orders, payments, sales],
  )
  /* Measured against all customers, not the five shown: against the top spender
     a bar only repeats what the ordering already says. */
  const receivedMinor = useMemo(
    () =>
      customerLifetimeValues(
        clientRows,
        orders,
        payments,
        sales,
      ).reduce((sum, customer) => sum + customer.paidMinor, 0),
    [clientRows, orders, payments, sales],
  )

  const repairs = useMemo(() => repairMetrics(orders, payments), [orders, payments])

  const expenseShares = useMemo(
    () =>
      pnl.byCategory.map((row) => ({
        key: row.category,
        label: EXPENSE_CATEGORY_LABELS[row.category],
        value: row.amountMinor,
        formatted: formatAmount(row.amountMinor, currency),
      })),
    [pnl.byCategory, currency],
  )

  const inProfit = pnl.profitMinor >= 0
  const gross = pnl.incomeMinor + pnl.expensesMinor
  const money = (minor: number) => formatAmount(minor, currency)
  const shown = picked === null ? null : buckets[picked]

  const busiest = buckets.reduce(
    (best, bucket) => (bucket.inMinor > best.inMinor ? bucket : best),
    buckets[0] ?? { inMinor: 0, spanLabel: '' },
  )

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
              value={money(pnl.profitMinor)}
              tone={gross === 0 ? 'neutral' : inProfit ? 'success' : 'danger'}
            />
          </div>

          <p class="mt-4 text-xs text-content-muted">
            {shown?.spanLabel ?? 'Tap a column for one day or week'}
          </p>

          <div class="mt-1.5">
            <FlowColumns
              bars={buckets.map((bucket) => ({
                label: bucket.label,
                up: bucket.inMinor,
                down: bucket.outMinor,
              }))}
              selected={picked}
              onSelect={setPicked}
              summary={`Money in and out by ${buckets.length} periods from ${period.label}. Busiest: ${busiest.spanLabel}, ${money(busiest.inMinor)} in.`}
            />
          </div>

          <dl class="mt-1 grid grid-cols-2 gap-3">
            <ChartKey
              swatch="bg-success"
              label="Money in"
              value={money(shown ? shown.inMinor : pnl.incomeMinor)}
              tone="text-success"
            />
            <ChartKey
              swatch="bg-danger"
              label="Money out"
              value={`-${money(shown ? shown.outMinor : pnl.expensesMinor)}`}
              tone="text-danger"
            />
          </dl>

          {gross === 0 && (
            <p class="mt-3 text-sm text-content-muted">Nothing recorded in this period.</p>
          )}
        </Card>

        {flags.catalogue && (
          <div class="flex justify-end">
            <a
              href="/reports/advanced"
              class="flex min-h-9 items-center gap-1 rounded-control px-1 text-sm font-semibold
                     text-accent transition-colors active:bg-pressed"
            >
              Advanced reports
              <IconChevronRight size={16} />
            </a>
          </div>
        )}

        <Card flush>
          <dl>
            <DataRow label="Counter sales">{money(pnl.salesIncomeMinor)}</DataRow>
            <DataRow label="Paid on orders">{money(pnl.orderIncomeMinor)}</DataRow>
            <DataRow label="Owed to you">
              <span class="text-money">{money(outstanding.total)}</span>
            </DataRow>
          </dl>
        </Card>

        {running.length > 1 && (
          <Card flush>
            <p class="text-sm text-content-muted">Running total, {period.label}</p>
            <p class="mt-1 text-heading font-semibold tabular-nums">
              {money(running[running.length - 1]!)}
            </p>
            <div class="mt-2">
              <Sparkline
                values={running}
                summary={`Running net from ${money(running[0]!)} to ${money(running[running.length - 1]!)} over ${running.length} periods, low point ${money(Math.min(...running))}.`}
              />
            </div>
            <p class="mt-1 text-xs text-content-muted">
              Money in less money out, added up across the period.
            </p>
          </Card>
        )}

        {outstanding.total > 0 && (
          <Card flush>
            <p class="text-sm text-content-muted">Owed to you</p>
            <div class="mt-1 flex items-baseline justify-between gap-3">
              <p class="text-heading font-semibold tabular-nums text-money">
                {money(outstanding.total)}
              </p>
              <p class="text-sm text-content-muted">
                across {outstanding.count} {outstanding.count === 1 ? 'order' : 'orders'}
              </p>
            </div>
            <p class="mt-1 text-xs text-content-muted">
              Work written up and not yet paid, so none of it is in the figures above.
            </p>
          </Card>
        )}

        {pnl.byCategory.length > 0 && (
          <Card flush>
            <h2 class="text-heading font-semibold">Where money went</h2>
            <p class="mt-0.5 mb-3 text-xs text-content-muted">
              {money(pnl.expensesMinor)} out, {period.label}
            </p>
            <ShareBar
              shares={expenseShares}
              total={pnl.expensesMinor}
              summary={`Spending split across ${expenseShares.length} categories. Largest: ${expenseShares[0]?.label ?? 'none'}, ${expenseShares[0]?.formatted ?? ''}.`}
            />
          </Card>
        )}

        <Card flush>
          <h2 class="text-heading font-semibold">Where the work is</h2>
          <p class="mt-0.5 text-xs text-content-muted">
            {stages.workCount} still to finish of {orders.length}{' '}
            {orders.length === 1 ? 'order' : 'orders'}
          </p>

          {stages.work.length > 0 ? (
            <div class="mt-3">
              <StatStrip>
                {stages.work.map(([stage, count]) => (
                  <StatTile key={stage} label={STAGE_LABELS[stage]} tone={STAGE_TONES[stage]}>
                    {count}
                  </StatTile>
                ))}
              </StatStrip>
            </div>
          ) : (
            <p class="mt-3 text-sm text-content-muted">Nothing open. Every order is finished.</p>
          )}

          {stages.finished.length > 0 && (
            <p class="mt-3 text-xs text-content-muted">
              {stages.finished
                .map(([stage, count]) => `${count} ${STAGE_LABELS[stage].toLowerCase()}`)
                .join(' · ')}
            </p>
          )}

          <div class="mt-3">
            <a
              href="/orders?filter=open"
              class="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-accent"
            >
              See open orders
              <IconChevronRight size={16} />
            </a>
          </div>
        </Card>

        {topCustomers.length > 0 && (
          <section class={FLUSH_SURFACE}>
            <h2 class="px-gutter pt-3 pb-1 text-heading font-semibold">Top customers</h2>
            <ul class="pt-1 pb-1">
              {topCustomers.map((customer) => (
                <li key={customer.clientId}>
                  {/* A ranking you can act on: the row is the way to the client. */}
                  <a
                    href={`/clients/${customer.clientId}`}
                    class="flex min-h-tap items-center gap-3 px-gutter py-2 transition-colors
                           hover:bg-hover active:bg-pressed"
                  >
                    <Avatar name={customer.name} size="sm" />
                    <span class="min-w-0 flex-1">
                      <span class="flex items-baseline gap-2">
                        <span class="min-w-0 flex-1 truncate text-[15px] font-medium">
                          {customer.name}
                        </span>
                        <span class="shrink-0 text-sm font-semibold tabular-nums">
                          {money(customer.paidMinor)}
                        </span>
                        <span class="w-9 shrink-0 text-right text-xs tabular-nums text-content-muted">
                          {receivedMinor === 0
                            ? '0%'
                            : `${Math.round((customer.paidMinor / receivedMinor) * 100)}%`}
                        </span>
                      </span>
                      <span class="mt-1 block h-1.5 overflow-hidden rounded-pill bg-surface-sunken">
                        <span
                          class="block h-full rounded-pill bg-accent"
                          style={{
                            width: `${receivedMinor === 0 ? 0 : (customer.paidMinor / receivedMinor) * 100}%`,
                          }}
                        />
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <p class="px-gutter pb-3 text-xs text-content-muted">
              Share of {money(receivedMinor)} received all time -- payments and counter sales,
              never an order's face value.
            </p>
          </section>
        )}

        {flags.repairs && repairs.totalCount > 0 && (
          <Card flush>
            <h2 class="text-heading font-semibold">Repairs</h2>
            <dl class="mt-2 space-y-1.5 text-sm">
              <Line label="Open">{repairs.openCount}</Line>
              <Line label="Completed">{repairs.completedCount}</Line>
              <Line label="Cancelled">{repairs.cancelledCount}</Line>
              <Line label="Collected">{money(repairs.paidMinor)}</Line>
              {repairs.averageTurnaroundDays !== null && (
                <Line label="Average turnaround">
                  {repairs.averageTurnaroundDays.toFixed(1)} days
                </Line>
              )}
            </dl>
          </Card>
        )}

      </Sections>
    </Screen>
  )
}

/** Doubles as the chart's legend: the swatch sits beside the label it names. */
function ChartKey({
  swatch,
  label,
  value,
  tone,
}: {
  swatch: string
  label: string
  value: string
  tone?: string
}) {
  return (
    <div>
      <dt class="flex items-center gap-1.5 text-xs font-medium text-content-muted">
        <span class={`size-1.5 shrink-0 rounded-full ${swatch}`} aria-hidden="true" />
        {label}
      </dt>
      <dd class={`mt-0.5 text-[15px] font-semibold tabular-nums ${tone ?? ''}`}>{value}</dd>
    </div>
  )
}

function Line({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div class="flex items-baseline justify-between gap-4">
      <dt class="text-content-muted">{label}</dt>
      <dd class="font-medium tabular-nums">{children}</dd>
    </div>
  )
}
