/** Sales: what went over the counter, and what sold most. */
import { useMemo, useState } from 'preact/hooks'
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Screen,
  SectionCard,
  Segmented,
  Skeleton,
} from '../components/ui'
import { IconMoney, IconPlus } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQueryStatus, useRxQuery } from '../hooks/useRxQuery'
import { useBack } from '../hooks/useBack'
import { itemsSold, saleTotalMinor } from '../db/profit'
import { voidSale } from '../db/writes'
import { formatMinor } from '../lib/money'
import { addDays, formatDateTime, today } from '../lib/dates'
import { PAYMENT_METHOD_LABELS } from './orderStage'

type Range = '7' | '30' | 'all'

const RANGES: readonly { value: Range; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: 'all', label: 'All' },
]

export function Sales() {
  const { db, shop, activeStaff } = useCurrentShop()
  const back = useBack()
  const [range, setRange] = useState<Range>('7')
  const [error, setError] = useState<string | null>(null)
  const now = today()

  const { value: saleDocs, loaded } = useRxQueryStatus(
    () => db.sales.find({ selector: { shop_id: shop.id }, sort: [{ sold_at: 'desc' }] }).$,
    [db, shop.id],
    [],
  )
  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )

  const clientNames = useMemo(
    () => new Map(clientDocs.map((doc) => [doc.id, doc.name])),
    [clientDocs],
  )
  const sales = useMemo(() => saleDocs.map((doc) => doc.toJSON()), [saleDocs])

  const from = range === 'all' ? '1970-01-01' : addDays(now, -(Number(range) - 1))

  const inRange = useMemo(
    () => sales.filter((sale) => sale.sold_at.slice(0, 10) >= from),
    [sales, from],
  )
  const totalMinor = useMemo(
    () => inRange.reduce((sum, sale) => sum + saleTotalMinor(sale), 0),
    [inRange],
  )
  const top = useMemo(() => itemsSold(inRange, from, now), [inRange, from, now])

  if (!loaded) {
    return (
      <Screen title="Sales" back={back}>
        <div class="space-y-4">
          <Skeleton class="h-20 w-full" />
          <Skeleton class="h-40 w-full" />
        </div>
      </Screen>
    )
  }

  if (sales.length === 0) {
    return (
      <Screen title="Sales" back={back}>
        <Card padded={false}>
          <EmptyState
            illustration={<IconMoney size={40} />}
            title="No sales recorded yet"
            description="A sale is money taken over the counter -- a ready-made shirt, a metre of fabric. No client record needed."
            action={
              <Button linkTo="/sales/new">
                <IconPlus size={18} /> Record a sale
              </Button>
            }
          />
        </Card>
      </Screen>
    )
  }

  return (
    <Screen
      title="Sales"
      back={back}
      action={
        <Button size="sm" linkTo="/sales/new">
          <IconPlus size={16} /> Sale
        </Button>
      }
    >
      <div class="space-y-5">
        <Segmented value={range} options={RANGES} onChange={setRange} label="Period" />

        <Card>
          <p class="text-xs font-medium text-stone-500 dark:text-stone-400">
            Taken over the counter
          </p>
          <p class="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight">
            {formatMinor(totalMinor, shop.currency)}
          </p>
          <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {inRange.length} {inRange.length === 1 ? 'sale' : 'sales'}
          </p>
        </Card>

        {top.length > 0 && (
          <SectionCard title="What sold" count={top.length}>
            <ul>
              {top.map((row) => (
                <li
                  key={row.item}
                  class="flex items-baseline justify-between gap-3 px-4 py-2.5"
                >
                  <span class="min-w-0">
                    <span class="block truncate font-medium">{row.item}</span>
                    <span class="text-sm text-stone-500 dark:text-stone-400">
                      {row.quantity} sold
                    </span>
                  </span>
                  <span class="shrink-0 text-sm font-semibold tabular-nums">
                    {formatMinor(row.revenueMinor, shop.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <SectionCard title="Recent" count={inRange.length}>
          <ul>
            {inRange.map((sale) => (
              <li key={sale.id} class="flex items-center justify-between gap-3 px-4 py-3.5">
                <span class="min-w-0">
                  <span class="block truncate font-medium">
                    {sale.quantity > 1 && `${sale.quantity} x `}
                    {sale.item_description}
                  </span>
                  <span class="block truncate text-xs text-stone-500 dark:text-stone-400">
                    {formatDateTime(sale.sold_at)} · {PAYMENT_METHOD_LABELS[sale.method]}
                    {sale.client_id && clientNames.has(sale.client_id)
                      ? ` · ${clientNames.get(sale.client_id)}`
                      : ''}
                  </span>
                </span>
                <span class="flex shrink-0 items-center gap-2">
                  <span class="text-sm font-semibold tabular-nums">
                    {formatMinor(saleTotalMinor(sale), shop.currency)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setError(null)
                      void voidSale(db, sale.id, undefined, activeStaff?.id).catch(
                        (err: unknown) =>
                          setError(
                            err instanceof Error ? err.message : 'Could not void that sale.',
                          ),
                      )
                    }}
                  >
                    Void
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </Screen>
  )
}
