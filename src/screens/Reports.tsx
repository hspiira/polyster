/**
 * Light reports (Phase 1 step 8).
 *
 * "Just enough for a shop owner to sanity-check the week at a glance", per
 * pwa-schema-and-screens.md s3 -- deliberately not an analytics suite.
 *
 * Everything is computed locally from replicated rows, so it works offline and
 * reflects exactly what this device knows. That last part matters, and the
 * screen says so rather than presenting stale figures as fact.
 */
import { useMemo, useState } from 'preact/hooks'
import { Card, Chip, HeaderAction, InfoNote, RowList, Screen, SectionTitle, Segmented } from '../components/ui'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import { observeShopBalances, signedAmountMinor } from '../db/balances'
import { profitAndLoss } from '../db/profit'
import { customerLifetimeValues } from '../db/customerValue'
import { repairMetrics } from '../db/repairMetrics'
import { EXPENSE_CATEGORY_LABELS } from './Expenses'
import { formatMinor } from '../lib/money'
import { addDays, today } from '../lib/dates'
import { STAGE_LABELS, STAGE_TONES } from './orderStage'
import { normalizeTone, TONE_SOLID } from '../ui/tones'
import { ORDER_STAGES } from '../db/schema'


export function Reports() {
  const { db, shop } = useCurrentShop()
  const flags = useFeatureFlags(db, shop.id)
  const now = today()

  const orderDocs = useRxQuery(
    () => db.orders.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const paymentDocs = useRxQuery(() => db.payments.find().$, [db], [])
  const balances = useRxQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())
  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const saleDocsForValue = useRxQuery(
    () => db.sales.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )

  const orders = useMemo(() => orderDocs.map((doc) => doc.toJSON()), [orderDocs])

  // Payments hang off orders rather than carrying shop_id. RLS means the local
  // database only ever holds this shop's rows, but filtering explicitly keeps
  // the report correct rather than correct-by-accident.
  const orderIds = useMemo(() => new Set(orders.map((order) => order.id)), [orders])

  const collected = useMemo(() => {
    const weekStart = addDays(now, -7)
    const monthStart = addDays(now, -30)
    let week = 0
    let month = 0
    let all = 0

    // Also bucketed by day for the last 7, so the trend line under the
    // headline figure is a breakdown of that same real total -- never a
    // fabricated series drawn to fill the card.
    const days = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6))
    const byDay = new Map(days.map((day) => [day, 0]))

    for (const doc of paymentDocs) {
      const payment = doc.toJSON()
      if (!orderIds.has(payment.order_id)) continue
      const day = payment.payment_date.slice(0, 10)
      // Signed by kind: a refund is money going back out, so counting it as
      // collected would overstate every figure on this screen.
      const amount = signedAmountMinor(payment)
      all += amount
      if (day >= monthStart) month += amount
      if (day >= weekStart) week += amount
      if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + amount)
    }

    return { week, month, all, trend: days.map((day) => byDay.get(day) ?? 0) }
  }, [paymentDocs, orderIds, now])

  const outstanding = useMemo(() => {
    // A cancelled order still carries a balance but is not chased for money,
    // so it is excluded from this aggregate rather than from calculateBalance.
    const cancelledIds = new Set(
      orders.filter((order) => order.stage === 'cancelled').map((order) => order.id),
    )
    const owing = [...balances.entries()]
      .filter(([orderId, balance]) => balance.balance_minor > 0 && !cancelledIds.has(orderId))
      .map(([, balance]) => balance)
    return {
      count: owing.length,
      total: owing.reduce((sum, balance) => sum + balance.balance_minor, 0),
    }
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
        paymentDocs.map((doc) => doc.toJSON()),
        saleDocsForValue.map((doc) => doc.toJSON()),
      ).slice(0, 5),
    [clientDocs, orders, paymentDocs, saleDocsForValue],
  )

  const repairs = useMemo(
    () => repairMetrics(orders, paymentDocs.map((doc) => doc.toJSON())),
    [orders, paymentDocs],
  )

  return (
    // Pushed rather than a tab root (spec A15), reachable from a Settings row
    // and from Today's profile header -- `back` matches the four sibling
    // settings sub-screens rather than assuming either entry point.
    <Screen
      title="Reports"
      back="/settings"
      action={flags.catalogue ? <HeaderAction href="/reports/advanced" label="Advanced" /> : undefined}
    >
      <div class="space-y-5">
        <ProfitCard />

        <Card>
          <p class="text-xs font-medium text-stone-500 dark:text-stone-400">Collected, 7 days</p>
          <p class="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight">
            {formatMinor(collected.week, shop.currency)}
          </p>
          <div class="mt-4 flex gap-8 text-sm">
            <span>
              <span class="block text-xs text-stone-500 dark:text-stone-400">30 days</span>
              <span class="font-semibold tabular-nums">{formatMinor(collected.month, shop.currency)}</span>
            </span>
            <span>
              <span class="block text-xs text-stone-500 dark:text-stone-400">All time</span>
              <span class="font-semibold tabular-nums">{formatMinor(collected.all, shop.currency)}</span>
            </span>
          </div>
        </Card>

        <section>
          <SectionTitle>Outstanding</SectionTitle>
          <Card>
            <div class="flex items-baseline justify-between">
              <span class="text-2xl font-semibold text-amber-700 dark:text-amber-400">
                {formatMinor(outstanding.total, shop.currency)}
              </span>
              <span class="text-sm text-stone-500 dark:text-stone-400">
                across {outstanding.count} order{outstanding.count === 1 ? '' : 's'}
              </span>
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle>Orders by stage</SectionTitle>
          <Card>
            <ul class="space-y-3">
              {[...stageCounts].map(([stage, count]) => (
                <li key={stage} class="flex items-center gap-3">
                  <span class="w-28 shrink-0 truncate text-sm text-stone-600 dark:text-stone-300">
                    {STAGE_LABELS[stage]}
                  </span>
                  {/* A bar, not a chart -- makes the shape of the workload
                      readable at a glance without pulling in a chart library
                      for five numbers. Coloured per stage tone, the same tone
                      the chip for that stage uses everywhere else, so a stage
                      is not one colour on the dashboard and another here. */}
                  <div class="h-2 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                    <div
                      class={`h-full rounded-full transition-[width] ${TONE_SOLID[normalizeTone(STAGE_TONES[stage])]}`}
                      style={{ width: `${(count / maxStage) * 100}%` }}
                    />
                  </div>
                  <span class="w-6 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
            <div class="mt-4 flex items-baseline justify-between text-sm">
              <span class="text-stone-600 dark:text-stone-300">Total</span>
              <span class="font-semibold tabular-nums">{orders.length}</span>
            </div>
          </Card>
        </section>

        {topCustomers.length > 0 && (
          <section>
            <SectionTitle>Top customers</SectionTitle>
            <Card padded={false}>
              <RowList>
                {topCustomers.map((customer) => (
                  <li key={customer.clientId} class="flex items-center justify-between gap-3 px-gutter py-3">
                    <span class="min-w-0 truncate text-sm font-medium">{customer.name}</span>
                    <span class="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMinor(customer.paidMinor, shop.currency)}
                    </span>
                  </li>
                ))}
              </RowList>
            </Card>
            <InfoNote>
              Lifetime value counts money actually received -- payments and counter sales -- never an
              order's face value.
            </InfoNote>
          </section>
        )}

        {flags.repairs && repairs.totalCount > 0 && (
          <section>
            <SectionTitle>Repairs</SectionTitle>
            <Card>
              <dl class="space-y-1.5 text-sm">
                <div class="flex justify-between gap-4">
                  <dt class="text-stone-500 dark:text-stone-400">Open</dt>
                  <dd class="font-medium tabular-nums">{repairs.openCount}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-stone-500 dark:text-stone-400">Completed</dt>
                  <dd class="font-medium tabular-nums">{repairs.completedCount}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-stone-500 dark:text-stone-400">Cancelled</dt>
                  <dd class="font-medium tabular-nums">{repairs.cancelledCount}</dd>
                </div>
                <div class="flex justify-between gap-4 border-t border-stone-100 pt-1.5 dark:border-stone-800">
                  <dt class="text-stone-500 dark:text-stone-400">Collected</dt>
                  <dd class="font-medium tabular-nums">{formatMinor(repairs.paidMinor, shop.currency)}</dd>
                </div>
                {repairs.averageTurnaroundDays !== null && (
                  <div class="flex justify-between gap-4">
                    <dt class="text-stone-500 dark:text-stone-400">Average turnaround</dt>
                    <dd class="font-medium tabular-nums">
                      {repairs.averageTurnaroundDays.toFixed(1)} days
                    </dd>
                  </div>
                )}
              </dl>
            </Card>
          </section>
        )}

        <InfoNote>
          Figures come from what is on this device. If it has not synced recently, another device's
          latest payments may not be counted yet.
        </InfoNote>
      </div>
    </Screen>
  )
}

/**
 * Profit for a period: what came in, what went out, what is left.
 *
 * The pilot shop's "Profits", and the reason expenses exist at all.
 *
 * Cash accounting throughout -- see db/profit.ts. Money in is money received,
 * never the value of orders written up, so this figure equals what the shop
 * can count. Outstanding is reported below, as outstanding, and is
 * deliberately not folded in here.
 */
function ProfitCard() {
  const { db, shop } = useCurrentShop()
  const [range, setRange] = useState<'30' | '7'>('30')
  const now = today()
  const from = addDays(now, -(Number(range) - 1))

  const saleDocs = useRxQuery(
    () => db.sales.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const paymentDocs = useRxQuery(() => db.payments.find().$, [db], [])
  const expenseDocs = useRxQuery(
    () => db.expenses.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )

  /**
   * Payments have to be scoped to this shop's orders, the way `collected` above
   * already scopes them.
   *
   * `profitAndLoss` filters by date and nothing else, and a payment carries no
   * shop_id -- it hangs off an order. RLS means the local database should hold
   * one shop's rows, but signing out does not clear it, so a device handed on
   * holds both shops'. Unscoped, this counted the other shop's order income
   * while excluding their sales and expenses, which *are* scoped: not a stale
   * figure but an incoherent one, where Money in stopped equalling its own two
   * subtotals.
   */
  const shopOrderIds = useRxQuery(
    () => db.orders.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const orderIdSet = useMemo(
    () => new Set(shopOrderIds.map((doc) => doc.id)),
    [shopOrderIds],
  )

  const pnl = useMemo(
    () =>
      profitAndLoss({
        sales: saleDocs.map((doc) => doc.toJSON()),
        payments: paymentDocs
          .map((doc) => doc.toJSON())
          .filter((payment) => orderIdSet.has(payment.order_id)),
        expenses: expenseDocs.map((doc) => doc.toJSON()),
        from,
        to: now,
      }),
    [saleDocs, paymentDocs, expenseDocs, orderIdSet, from, now],
  )

  const nothingRecorded = pnl.incomeMinor === 0 && pnl.expensesMinor === 0
  const inProfit = pnl.profitMinor >= 0

  return (
    <section class="space-y-3">
      <Segmented
        value={range}
        options={[
          { value: '7' as const, label: '7 days' },
          { value: '30' as const, label: '30 days' },
        ]}
        onChange={setRange}
        label="Profit period"
      />

      <Card>
        <p class="text-xs font-medium text-stone-500 dark:text-stone-400">
          {inProfit ? 'Profit' : 'Loss'}, {range} days
        </p>
        <p
          class={`mt-1.5 text-3xl font-semibold tabular-nums tracking-tight ${
            nothingRecorded
              ? ''
              : inProfit
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-700 dark:text-red-400'
          }`}
        >
          {formatMinor(pnl.profitMinor, shop.currency)}
        </p>

        <dl class="mt-4 space-y-1.5 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-stone-500 dark:text-stone-400">Money in</dt>
            <dd class="font-medium tabular-nums">
              {formatMinor(pnl.incomeMinor, shop.currency)}
            </dd>
          </div>
          {/* Broken out because "why is income higher than my sales" is the
              first question a shop asks of a combined figure. */}
          <div class="flex justify-between gap-4 pl-3 text-xs text-stone-500 dark:text-stone-400">
            <dt>Counter sales</dt>
            <dd class="tabular-nums">{formatMinor(pnl.salesIncomeMinor, shop.currency)}</dd>
          </div>
          <div class="flex justify-between gap-4 pl-3 text-xs text-stone-500 dark:text-stone-400">
            <dt>Paid on orders</dt>
            <dd class="tabular-nums">{formatMinor(pnl.orderIncomeMinor, shop.currency)}</dd>
          </div>
          <div class="flex justify-between gap-4 border-t border-stone-100 pt-1.5 dark:border-stone-800">
            <dt class="text-stone-500 dark:text-stone-400">Money out</dt>
            <dd class="font-medium tabular-nums">
              {formatMinor(pnl.expensesMinor, shop.currency)}
            </dd>
          </div>
        </dl>

        {pnl.byCategory.length > 0 && (
          <ul class="mt-3 flex flex-wrap gap-1.5">
            {pnl.byCategory.map((row) => (
              <li key={row.category}>
                <Chip>
                  {EXPENSE_CATEGORY_LABELS[row.category]}{' '}
                  {formatMinor(row.amountMinor, shop.currency)}
                </Chip>
              </li>
            ))}
          </ul>
        )}

        {nothingRecorded && (
          <p class="mt-3 text-sm text-stone-500 dark:text-stone-400">
            Nothing recorded in this period yet. Profit needs both halves: record sales and
            expenses and it fills in.
          </p>
        )}

        {pnl.expensesMinor === 0 && pnl.incomeMinor > 0 && (
          <p class="mt-3 text-sm text-amber-700 dark:text-amber-400">
            No expenses recorded, so this is really just income. Add what the shop spent for a
            profit figure that means something.
          </p>
        )}
      </Card>
    </section>
  )
}
