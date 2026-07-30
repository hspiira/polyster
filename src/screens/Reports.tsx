/**
 * Light reports (Phase 1 step 8).
 *
 * "Just enough for a shop owner to sanity-check the week at a glance", per
 * pwa-schema-and-screens.md section 3 -- deliberately not an analytics suite.
 *
 * Everything is computed locally from replicated rows, so it works offline and
 * reflects exactly what this device knows. That last part matters: if the
 * device is behind, the figures are behind, which is why the sync badge stays
 * on screen rather than being hidden on a reporting page.
 */
import { useMemo } from 'preact/hooks'
import { Card, Screen } from '../components/ui'
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

  // Payments are not scoped by shop_id -- they hang off orders. RLS means the
  // local database only ever holds this shop's rows, but filtering explicitly
  // keeps the report correct rather than correct-by-accident.
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

  return (
    <Screen title="Reports">
      <div class="space-y-4">
        <Card>
          <h2 class="font-medium text-gray-900">Collected</h2>
          <dl class="mt-2 space-y-1 text-sm">
            <Line label="Last 7 days" value={formatMoney(collected.week)} />
            <Line label="Last 30 days" value={formatMoney(collected.month)} />
            <Line label="All time" value={formatMoney(collected.all)} />
          </dl>
        </Card>

        <Card>
          <h2 class="font-medium text-gray-900">Outstanding</h2>
          <dl class="mt-2 space-y-1 text-sm">
            <Line label="Orders with a balance" value={String(outstanding.count)} />
            <Line label="Total owed" value={formatMoney(outstanding.total)} />
          </dl>
        </Card>

        <Card>
          <h2 class="font-medium text-gray-900">Orders by stage</h2>
          <dl class="mt-2 space-y-1 text-sm">
            {[...stageCounts].map(([stage, count]) => (
              <Line key={stage} label={STAGE_LABELS[stage]} value={String(count)} />
            ))}
            <Line label="Total" value={String(orders.length)} />
          </dl>
        </Card>

        <p class="text-xs text-gray-500">
          Figures come from what is on this device. If it has not synced recently, another device's
          latest payments may not be counted yet.
        </p>
      </div>
    </Screen>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div class="flex justify-between gap-4">
      <dt class="text-gray-500">{label}</dt>
      <dd class="font-medium text-gray-900">{value}</dd>
    </div>
  )
}
