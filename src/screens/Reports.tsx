/**
 * Reports: the week or the quarter, read at a glance.
 *
 * Everything is computed on the device from replicated rows, so it works
 * offline and reflects exactly what this device knows -- which the screen says,
 * rather than presenting figures that may be behind as fact.
 *
 * Cash accounting, as everywhere else: money in is money received. Work written
 * up but unpaid is reported separately, as outstanding.
 */
import { useMemo, useState } from 'preact/hooks'
import {
  Button,
  Card,
  FlowColumns,
  FLUSH_SURFACE,
  InfoNote,
  MeterRow,
  PeriodBar,
  PeriodRangeFields,
  Screen,
  Sections,
  Sparkline,
  StatStrip,
  StatTile,
  StatValue,
} from '../ui'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import { usePeriod } from '../hooks/usePeriod'
import { observeShopBalances } from '../db/balances'
import { profitAndLoss } from '../db/profit'
import { customerLifetimeValues } from '../db/customerValue'
import { repairMetrics } from '../db/repairMetrics'
import { cashFlow, cumulativeNet } from './reportsModel'
import { useMoneySections } from './moneySections'
import { EXPENSE_CATEGORY_LABELS } from './expenseCategories'
import { formatMinor } from '../lib/money'
import { STAGE_LABELS, STAGE_TONES } from './orderStage'
import { normalizeTone, TONE_SOLID } from '../ui/tones'
import { ORDER_STAGES } from '../db/schema'

const TOP_CUSTOMERS = 5

export function Reports() {
  const { db, shop } = useCurrentShop()
  const flags = useFeatureFlags(db, shop.id)
  const sections = useMoneySections()
  const period = usePeriod('30')
  const [picked, setPicked] = useState<number | null>(null)

  const orderDocs = useRxQuery(
    () => db.orders.find({ selector: { shop_id: shop.id } }).$,
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
  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const balances = useRxQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())

  const orders = useMemo(() => orderDocs.map((doc) => doc.toJSON()), [orderDocs])
  const sales = useMemo(() => saleDocs.map((doc) => doc.toJSON()), [saleDocs])
  const expenses = useMemo(() => expenseDocs.map((doc) => doc.toJSON()), [expenseDocs])

  /**
   * A payment carries no shop_id -- it hangs off an order -- so it has to be
   * scoped through one. A device handed on still holds the previous shop's rows
   * until it is wiped, and unscoped this would count their income against this
   * shop's expenses.
   */
  const orderIds = useMemo(() => new Set(orders.map((order) => order.id)), [orders])
  const payments = useMemo(
    () => paymentDocs.map((doc) => doc.toJSON()).filter((p) => orderIds.has(p.order_id)),
    [paymentDocs, orderIds],
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
      total += balance.balance_minor
      count += 1
    }
    return { total, count }
  }, [balances, orders])

  const stageCounts = useMemo(() => {
    const counts = new Map(ORDER_STAGES.map((stage) => [stage, 0]))
    for (const order of orders) counts.set(order.stage, (counts.get(order.stage) ?? 0) + 1)
    return counts
  }, [orders])
  const maxStage = Math.max(1, ...stageCounts.values())

  const topCustomers = useMemo(
    () =>
      customerLifetimeValues(
        clientDocs.map((doc) => doc.toJSON()),
        orders,
        payments,
        sales,
      ).slice(0, TOP_CUSTOMERS),
    [clientDocs, orders, payments, sales],
  )
  const topCustomerPeak = Math.max(1, ...topCustomers.map((c) => c.paidMinor))

  const repairs = useMemo(() => repairMetrics(orders, payments), [orders, payments])

  const inProfit = pnl.profitMinor >= 0
  const gross = pnl.incomeMinor + pnl.expensesMinor
  const money = (minor: number) => formatMinor(minor, shop.currency)
  const shown = picked === null ? null : buckets[picked]

  const busiest = buckets.reduce(
    (best, bucket) => (bucket.inMinor > best.inMinor ? bucket : best),
    buckets[0] ?? { inMinor: 0, spanLabel: '' },
  )

  return (
    <Screen label="Money" sections={sections}>
      <Sections>
        <div>
          <PeriodBar value={period.key} onChange={period.setKey} />
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
              swatch="bg-content-subtle"
              label="Money out"
              value={money(shown ? shown.outMinor : pnl.expensesMinor)}
            />
          </dl>

          {gross === 0 && (
            <p class="mt-3 text-sm text-content-muted">Nothing recorded in this period.</p>
          )}
        </Card>

        <StatStrip>
          <StatTile label="Counter sales">{money(pnl.salesIncomeMinor)}</StatTile>
          <StatTile label="Paid on orders">{money(pnl.orderIncomeMinor)}</StatTile>
          <StatTile label="Owed to you" tone="money">
            {money(outstanding.total)}
          </StatTile>
        </StatStrip>

        {running.length > 1 && (
          <Card flush>
            <p class="text-sm text-content-muted">Running total, {period.label}</p>
            <p class="mt-1 text-heading font-semibold tabular-nums">
              {money(running[running.length - 1]!)}
            </p>
            <div class="mt-2">
              <Sparkline
                values={running}
                tone={inProfit ? 'var(--success)' : 'var(--danger)'}
                summary={`Running net from ${money(running[0]!)} to ${money(running[running.length - 1]!)} over ${running.length} periods.`}
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
          <section class={FLUSH_SURFACE}>
            <h2 class="px-gutter pt-3 pb-1 text-heading font-semibold">Where money went</h2>
            <div class="px-gutter pt-1 pb-3">
              {pnl.byCategory.map((row) => (
                <MeterRow
                  key={row.category}
                  label={EXPENSE_CATEGORY_LABELS[row.category]}
                  value={money(row.amountMinor)}
                  share={pnl.expensesMinor === 0 ? 0 : row.amountMinor / pnl.expensesMinor}
                  trailing={
                    pnl.expensesMinor === 0
                      ? '0%'
                      : `${Math.round((row.amountMinor / pnl.expensesMinor) * 100)}%`
                  }
                />
              ))}
            </div>
          </section>
        )}

        <section class={FLUSH_SURFACE}>
          <h2 class="flex items-baseline gap-1.5 px-gutter pt-3 pb-1 text-heading font-semibold">
            Orders by stage
            <span class="text-xs font-normal text-content-muted">{orders.length}</span>
          </h2>
          <div class="px-gutter pt-1 pb-3">
            {[...stageCounts].map(([stage, count]) => (
              <MeterRow
                key={stage}
                label={STAGE_LABELS[stage]}
                value={count}
                share={count / maxStage}
                tone={TONE_SOLID[normalizeTone(STAGE_TONES[stage])]}
              />
            ))}
          </div>
        </section>

        {topCustomers.length > 0 && (
          <section class={FLUSH_SURFACE}>
            <h2 class="px-gutter pt-3 pb-1 text-heading font-semibold">Top customers</h2>
            <div class="px-gutter pt-1 pb-3">
              {topCustomers.map((customer) => (
                <MeterRow
                  key={customer.clientId}
                  label={customer.name}
                  value={money(customer.paidMinor)}
                  share={customer.paidMinor / topCustomerPeak}
                />
              ))}
            </div>
            <p class="px-gutter pb-3 text-xs text-content-muted">
              Money actually received -- payments and counter sales, all time -- never an order's
              face value.
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

        {flags.catalogue && (
          <Button variant="secondary" class="w-full" linkTo="/reports/advanced">
            Advanced reports
          </Button>
        )}

        <InfoNote>
          Figures come from what is on this device and count money that actually moved. If it has
          not synced recently, another device's latest payments may not be counted yet.
        </InfoNote>
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
