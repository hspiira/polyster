/* Reports at a desk. Payments carry no shop_id, so order ids are the filter:
   a device handed to a second shop would otherwise mix one shop's income in. */
import { useMemo, useState } from 'preact/hooks'
import { useCurrentShop } from '../state/ShopProvider'
import { useQuery } from '../hooks/useQuery'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import { profitAndLoss } from '../db/profit'
import { customerLifetimeValues } from '../db/customerValue'
import { repairMetrics } from '../db/repairMetrics'
import { formatMinor } from '../lib/money'
import { addDays, today } from '../lib/dates'
import { EXPENSE_CATEGORY_LABELS } from '../screens/expenseCategories'
import { STAGE_LABELS } from '../screens/orderStage'
import { ORDER_STAGES } from '../db/schema'
import { cn } from '../lib/cn'
import { Page } from './Page'
import { RADIUS, TEXT_SM, TEXT_XS } from './chrome'
import { PeriodSwitch, RANGES, type RangeKey } from './period'
import { observeClients, observeExpenses, observeOrders, observePayments, observeSales, observeShopBalances } from '../db/repo'

export function ReportsPage() {
  const { db, shop } = useCurrentShop()
  const flags = useFeatureFlags(db, shop.id)
  const [range, setRange] = useState<RangeKey>('30')
  const now = today()
  const from = addDays(now, -(RANGES[range].days - 1))

  const orders = useQuery(() => observeOrders(db, shop.id), [db, shop.id], [])
  const saleRows = useQuery(() => observeSales(db, shop.id), [db, shop.id], [])
  const expenseRows = useQuery(() => observeExpenses(db, shop.id), [db, shop.id], [])
  const clientRows = useQuery(() => observeClients(db, shop.id), [db, shop.id], [])
  const paymentRows = useQuery(() => observePayments(db), [db], [])
  const balances = useQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())

  const orderIds = useMemo(() => new Set(orders.map((order) => order.id)), [orders])

  const topCustomers = useMemo(
    () =>
      customerLifetimeValues(
        clientRows,
        orders,
        paymentRows,
        saleRows,
      ).slice(0, 5),
    [clientRows, orders, paymentRows, saleRows],
  )

  const repairs = useMemo(
    () => repairMetrics(orders, paymentRows),
    [orders, paymentRows],
  )

  const pnl = useMemo(
    () =>
      profitAndLoss({
        sales: saleRows,
        payments: paymentRows
          
          .filter((payment) => orderIds.has(payment.order_id)),
        expenses: expenseRows,
        from,
        to: now,
      }),
    [saleRows, paymentRows, expenseRows, orderIds, from, now],
  )

  const outstanding = useMemo(() => {
    const cancelled = new Set(
      orders.filter((order) => order.stage === 'cancelled').map((order) => order.id),
    )
    const owing = [...balances.entries()].filter(
      ([id, balance]) => balance.balance_minor > 0 && !cancelled.has(id),
    )
    return {
      count: owing.length,
      total: owing.reduce((sum, [, balance]) => sum + balance.balance_minor, 0),
    }
  }, [orders, balances])

  const stages = useMemo(() => {
    const counts = new Map(ORDER_STAGES.map((stage) => [stage, 0]))
    for (const order of orders) counts.set(order.stage, (counts.get(order.stage) ?? 0) + 1)
    return [...counts].filter(([, count]) => count > 0)
  }, [orders])

  const maxStage = Math.max(1, ...stages.map(([, count]) => count))
  const inProfit = pnl.profitMinor >= 0

  return (
    <Page
      crumbs={['Money']}
      title="Reports"
      viewbar={
        <>
          <PeriodSwitch value={range} onChange={setRange} />
          <span class="flex-1" />
          <span class={cn('text-content-subtle', TEXT_XS)}>
            From what this device has synced
          </span>
          {flags.catalogue && (
            <a href="/reports/advanced" class={cn('font-medium text-accent', TEXT_XS)}>
              Advanced reports
            </a>
          )}
        </>
      }
    >
      <div class="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
        <div class="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-2.5">
          <Figure
            label={`${inProfit ? 'Profit' : 'Loss'}, ${RANGES[range].label.toLowerCase()}`}
            value={formatMinor(pnl.profitMinor, shop.currency)}
            tone={pnl.incomeMinor === 0 && pnl.expensesMinor === 0 ? undefined : inProfit ? 'success' : 'danger'}
            big
          />
          <Figure label="Money in" value={formatMinor(pnl.incomeMinor, shop.currency)} />
          <Figure label="Money out" value={formatMinor(pnl.expensesMinor, shop.currency)} />
          <Figure
            label={`Owed by ${outstanding.count} ${outstanding.count === 1 ? 'order' : 'orders'}`}
            value={formatMinor(outstanding.total, shop.currency)}
            tone={outstanding.total > 0 ? 'money' : undefined}
          />
        </div>

        <div class="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] items-start gap-2.5">
          <Panel title="Money in">
            <Line
              label="Counter sales"
              value={formatMinor(pnl.salesIncomeMinor, shop.currency)}
            />
            <Line
              label="Payments on orders"
              value={formatMinor(pnl.orderIncomeMinor, shop.currency)}
            />
            <p class={cn('mt-2 leading-relaxed text-content-subtle', TEXT_XS)}>
              Cash received, not the value of orders written up. A shop with unpaid orders on the
              books has not earned them.
            </p>
          </Panel>

          <Panel title="Where money went">
            {pnl.byCategory.length === 0 ? (
              <p class={cn('text-content-subtle', TEXT_XS)}>No expenses in this period.</p>
            ) : (
              pnl.byCategory.map((entry) => (
                <Line
                  key={entry.category}
                  label={EXPENSE_CATEGORY_LABELS[entry.category]}
                  value={formatMinor(entry.amountMinor, shop.currency)}
                />
              ))
            )}
          </Panel>

          <Panel title="Orders by stage">
            {stages.map(([stage, count]) => (
              <div key={stage} class="flex items-center gap-2.5 py-1">
                <span class={cn('w-[5.5rem] shrink-0 truncate text-content-muted', TEXT_XS)}>
                  {STAGE_LABELS[stage]}
                </span>
                <span class="h-1.5 flex-1 overflow-hidden rounded-sm bg-surface-sunken">
                  <span
                    class="block h-full rounded-sm bg-accent"
                    style={`width: ${(count / maxStage) * 100}%`}
                  />
                </span>
                <span class={cn('w-6 shrink-0 text-right font-semibold tabular-nums', TEXT_XS)}>
                  {count}
                </span>
              </div>
            ))}
          </Panel>

          {topCustomers.length > 0 && (
            <Panel title="Top customers">
              {topCustomers.map((customer) => (
                <Line key={customer.clientId} label={customer.name} value={formatMinor(customer.paidMinor, shop.currency)} />
              ))}
              <p class={cn('mt-2 leading-relaxed text-content-subtle', TEXT_XS)}>
                Lifetime value counts money actually received, never an order's face value.
              </p>
            </Panel>
          )}

          {flags.repairs && repairs.totalCount > 0 && (
            <Panel title="Repairs">
              <Line label="Open" value={String(repairs.openCount)} />
              <Line label="Completed" value={String(repairs.completedCount)} />
              <Line label="Cancelled" value={String(repairs.cancelledCount)} />
              <Line label="Collected" value={formatMinor(repairs.paidMinor, shop.currency)} />
              {repairs.averageTurnaroundDays !== null && (
                <Line label="Average turnaround" value={`${repairs.averageTurnaroundDays.toFixed(1)} days`} />
              )}
            </Panel>
          )}
        </div>
      </div>
    </Page>
  )
}

function Figure({
  label,
  value,
  tone,
  big = false,
}: {
  label: string
  value: string
  tone?: 'success' | 'danger' | 'money'
  big?: boolean
}) {
  return (
    <div class={cn('bg-surface px-3 py-2.5', RADIUS)}>
      <p class={cn('text-content-muted', TEXT_XS)}>{label}</p>
      <p
        class={cn(
          'mt-1 font-semibold leading-none tracking-tight tabular-nums',
          big ? 'text-[26px]' : 'text-[19px]',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-danger',
          tone === 'money' && 'text-money',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <section class={cn('bg-surface p-3', RADIUS)}>
      <h2 class={cn('mb-1.5 font-semibold', TEXT_SM)}>{title}</h2>
      {children}
    </section>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div class="flex items-baseline justify-between gap-3 border-b border-line py-1 last:border-b-0">
      <span class={cn('min-w-0 truncate text-content-muted', TEXT_XS)}>{label}</span>
      <span class={cn('shrink-0 font-semibold tabular-nums', TEXT_XS)}>{value}</span>
    </div>
  )
}
