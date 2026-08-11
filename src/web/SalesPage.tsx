/**
 * Sales, at a desk: the counter's day as a ledger.
 *
 * The phone's list answers "did I record that shirt". This answers "what did we
 * sell", which is a different question and wants a total, a period, and what
 * sold grouped by item -- all of which `itemsSold` and `saleTotalMinor` already
 * compute for Reports.
 */
import { useMemo, useState } from 'preact/hooks'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { itemsSold, saleTotalMinor, type SoldItem } from '../db/profit'
import { formatMinor } from '../lib/money'
import { addDays, formatDate, today } from '../lib/dates'
import { PAYMENT_METHOD_LABELS } from '../screens/orderStage'
import type { SaleDoc } from '../db/schema'
import { EmptyState } from '../ui'
import { IconMoney } from '../components/icons'
import { cn } from '../lib/cn'
import { Page } from './Page'
import { Table, type TableColumn } from './Table'
import { CONTROL_SM, RADIUS, TEXT_SM, TEXT_XS } from './chrome'
import { PeriodSwitch, RANGES, type RangeKey } from './period'


export function SalesPage() {
  const { db, shop } = useCurrentShop()
  const [range, setRange] = useState<RangeKey>('30')
  const now = today()
  const from = addDays(now, -(RANGES[range].days - 1))

  const saleDocs = useRxQuery(
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
  const inPeriod = useMemo(
    () => sales.filter((sale) => sale.sold_at.slice(0, 10) >= from && sale.sold_at.slice(0, 10) <= now),
    [sales, from, now],
  )
  const total = useMemo(
    () => inPeriod.reduce((sum, sale) => sum + saleTotalMinor(sale), 0),
    [inPeriod],
  )
  const grouped = useMemo(() => itemsSold(sales, from, now), [sales, from, now])

  const columns: TableColumn<SaleDoc>[] = [
    {
      id: 'item',
      label: 'Item',
      width: 'minmax(9rem, 2.2fr)',
      render: (sale) => (
        <span class="truncate font-semibold">
          {sale.item_description}
          {sale.quantity > 1 && (
            <span class="font-normal text-content-subtle"> × {sale.quantity}</span>
          )}
        </span>
      ),
    },
    {
      id: 'client',
      label: 'Client',
      width: 'minmax(6rem, 1.2fr)',
      render: (sale) =>
        sale.client_id ? (
          clientNames.get(sale.client_id) ?? 'Unknown'
        ) : (
          <span class="text-content-subtle">Walk-in</span>
        ),
    },
    {
      id: 'method',
      label: 'Paid by',
      width: '6.5rem',
      render: (sale) => PAYMENT_METHOD_LABELS[sale.method],
    },
    {
      id: 'when',
      label: 'Sold',
      width: '6.5rem',
      render: (sale) => formatDate(sale.sold_at.slice(0, 10)),
    },
    {
      id: 'total',
      label: 'Total',
      width: '6.5rem',
      align: 'end',
      render: (sale) => (
        <span class="font-semibold">{formatMinor(saleTotalMinor(sale), shop.currency)}</span>
      ),
    },
  ]

  return (
    <Page
      crumbs={['Money']}
      title="Sales"
      actions={
        <a
          href="/sales/new"
          class={cn(
            'flex items-center bg-accent px-3 font-semibold text-accent-content hover:brightness-110',
            CONTROL_SM,
            RADIUS,
            TEXT_SM,
          )}
        >
          Record a sale
        </a>
      }
      viewbar={
        <>
          <PeriodSwitch value={range} onChange={setRange} />
          <span class="flex-1" />
          <span class={cn('text-content-subtle tabular-nums', TEXT_XS)}>
            {inPeriod.length} in {RANGES[range].label.toLowerCase()} ·{' '}
            <span class="font-semibold text-money">{formatMinor(total, shop.currency)}</span>
          </span>
        </>
      }
    >
      <div class="work-split-outer">
        <div class="work-split">
          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
            <Table
              label="Sales"
              items={inPeriod}
              columns={columns}
              getKey={(sale) => sale.id}
              empty={
                <EmptyState
                  illustration={<IconMoney size={22} />}
                  title="No sales in this period"
                  description="Record what goes over the counter and it shows here, with a total."
                />
              }
            />
          </div>

          {grouped.length > 0 && <WhatSold items={grouped} currency={shop.currency} />}
        </div>
      </div>
    </Page>
  )
}

/**
 * Grouped by item, best-selling first. Its own pane rather than a second table:
 * "what sells" is a standing question, and it belongs beside the ledger rather
 * than under it where it would be scrolled past.
 */
function WhatSold({ items, currency }: { items: readonly SoldItem[]; currency: string }) {
  return (
    <aside class={cn('side-pane flex flex-col overflow-hidden bg-surface', RADIUS)}>
      <h2 class={cn('shrink-0 px-3 pb-1.5 pt-2.5 font-semibold', TEXT_SM)}>What sold</h2>
      <ul class="min-h-0 overflow-y-auto pb-2">
        {items.map((item) => (
          <li
            key={item.item}
            class="flex items-baseline justify-between gap-2 px-3 py-1.5"
          >
            <span class={cn('min-w-0 truncate', TEXT_XS)}>
              {item.item}
              <span class="text-content-subtle"> × {item.quantity}</span>
            </span>
            <span class={cn('shrink-0 font-semibold tabular-nums', TEXT_XS)}>
              {formatMinor(item.revenueMinor, currency)}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
