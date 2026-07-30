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
import { useMemo } from 'preact/hooks'
import { Card, InfoNote, Screen, SectionTitle } from '../components/ui'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances } from '../db/balances'
import { formatMoney } from '../lib/money'
import { addDays, today } from '../lib/dates'
import { STAGE_LABELS } from './orderStage'
import { ORDER_STAGES } from '../db/schema'

export function Reports() {
  const { db, shop } = useCurrentShop()
  const now = today()

  const orderDocs = useRxQuery(
    () => db.orders.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const paymentDocs = useRxQuery(() => db.payments.find().$, [db], [])
  const balances = useRxQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())

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

    for (const doc of paymentDocs) {
      const payment = doc.toJSON()
      if (!orderIds.has(payment.order_id)) continue
      const day = payment.payment_date.slice(0, 10)
      all += payment.amount
      if (day >= monthStart) month += payment.amount
      if (day >= weekStart) week += payment.amount
    }
    return { week, month, all }
  }, [paymentDocs, orderIds, now])

  const outstanding = useMemo(() => {
    const owing = [...balances.values()].filter((balance) => balance.balance > 0)
    return {
      count: owing.length,
      total: owing.reduce((sum, balance) => sum + balance.balance, 0),
    }
  }, [balances])

  const stageCounts = useMemo(() => {
    const counts = new Map(ORDER_STAGES.map((stage) => [stage, 0]))
    for (const order of orders) counts.set(order.stage, (counts.get(order.stage) ?? 0) + 1)
    return counts
  }, [orders])

  const maxStage = Math.max(1, ...stageCounts.values())

  return (
    <Screen title="Reports" back="/settings">
      <div class="space-y-5">
        <div class="rounded-card bg-gradient-to-br from-brand-700 to-brand-800 p-5 text-white shadow-raised">
          <p class="text-xs font-medium tracking-wide opacity-80">Collected, 7 days</p>
          <p class="mt-1 text-3xl font-semibold tracking-tight">{formatMoney(collected.week)}</p>
          <div class="mt-4 flex gap-6 border-t border-white/20 pt-3 text-sm">
            <span>
              <span class="block opacity-80">30 days</span>
              <span class="font-semibold">{formatMoney(collected.month)}</span>
            </span>
            <span>
              <span class="block opacity-80">All time</span>
              <span class="font-semibold">{formatMoney(collected.all)}</span>
            </span>
          </div>
        </div>

        <section>
          <SectionTitle>Outstanding</SectionTitle>
          <Card>
            <div class="flex items-baseline justify-between">
              <span class="text-2xl font-semibold text-amber-700 dark:text-amber-400">
                {formatMoney(outstanding.total)}
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
            <ul class="space-y-2.5">
              {[...stageCounts].map(([stage, count]) => (
                <li key={stage}>
                  <div class="flex items-baseline justify-between text-sm">
                    <span class="text-stone-600 dark:text-stone-300">{STAGE_LABELS[stage]}</span>
                    <span class="font-semibold tabular-nums">{count}</span>
                  </div>
                  {/* A bar, not a chart. It makes the shape of the workload
                      readable at a glance without pulling in a chart library
                      for five numbers. */}
                  <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                    <div
                      class="h-full rounded-full bg-brand-600"
                      style={{ width: `${(count / maxStage) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div class="mt-3 flex items-baseline justify-between border-t border-stone-100 pt-3 text-sm dark:border-stone-800">
              <span class="text-stone-600 dark:text-stone-300">Total</span>
              <span class="font-semibold tabular-nums">{orders.length}</span>
            </div>
          </Card>
        </section>

        <InfoNote>
          Figures come from what is on this device. If it has not synced recently, another device's
          latest payments may not be counted yet.
        </InfoNote>
      </div>
    </Screen>
  )
}
