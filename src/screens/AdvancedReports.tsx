/* Profitability and inventory valuation. Revenue is counted at each sold
   unit's list price, not a reconciled transaction amount. */
import { useMemo } from 'preact/hooks'
import { Card, RowList, Screen, SectionTitle, Skeleton } from '../ui'
import { useCurrentShop } from '../state/ShopProvider'
import { useQueryStatus } from '../hooks/useQuery'
import { formatMinor } from '../lib/money'
import {
  batchProfitability,
  collectionPerformance,
  inventoryValuation,
  liveQuery,
  loadAnalyticsBundle,
  productProfitability,
} from '../db/repo'
import { useBack } from '../hooks/useBack'
import type { ProfitabilityRow } from '../db/repo'

export function AdvancedReports() {
  const back = useBack()
  const { db, shop } = useCurrentShop()
  const currency = shop.currency

  const bundle = useQueryStatus(
    () => liveQuery(() => loadAnalyticsBundle(db, shop.id)),
    [db, shop.id],
    null,
  )

  const report = useMemo(
    () =>
      bundle.value
        ? {
            batches: batchProfitability(bundle.value),
            products: productProfitability(bundle.value),
            collections: collectionPerformance(bundle.value),
            inventory: inventoryValuation(bundle.value),
          }
        : null,
    [bundle.value],
  )

  return (
    <Screen title="Advanced reports" back={back}>
      <div class="space-y-5">
        {!report && (
          <div class="space-y-2">
            <Skeleton class="h-14" />
            <Skeleton class="h-14" />
            <Skeleton class="h-14" />
          </div>
        )}

        {report && (
          <>
            <section>
              <SectionTitle>Inventory valuation</SectionTitle>
              <Card>
                <dl class="space-y-1.5 text-sm">
                  <div class="flex justify-between gap-4">
                    <dt class="text-content-muted">Finished goods, at cost</dt>
                    <dd class="font-medium tabular-nums">
                      {formatMinor(report.inventory.finishedGoodsValueMinor, currency)}
                    </dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-content-muted">Materials, at cost</dt>
                    <dd class="font-medium tabular-nums">
                      {formatMinor(report.inventory.materialsValueMinor, currency)}
                    </dd>
                  </div>
                  <div class="flex justify-between gap-4 border-t border-line pt-1.5">
                    <dt class="text-content-muted">Total</dt>
                    <dd class="font-semibold tabular-nums">
                      {formatMinor(report.inventory.totalValueMinor, currency)}
                    </dd>
                  </div>
                </dl>
              </Card>
            </section>

            <ProfitabilitySection
              title="Collection performance"
              empty="No collections yet."
              currency={currency}
              rows={report.collections}
              renderExtra={(row) => (
                <span class="block text-xs text-content-subtle">
                  {row.unitsSold} sold of {row.unitsProduced} made
                </span>
              )}
            />

            <ProfitabilitySection
              title="Product profitability"
              empty="No products yet."
              currency={currency}
              rows={report.products}
            />

            <ProfitabilitySection
              title="Batch profitability"
              empty="No production batches yet."
              currency={currency}
              rows={report.batches}
            />

          </>
        )}
      </div>
    </Screen>
  )
}

function ProfitabilitySection<T extends ProfitabilityRow>({
  title,
  empty,
  currency,
  rows,
  renderExtra,
}: {
  title: string
  empty: string
  currency: string
  rows: readonly T[]
  renderExtra?: (row: T) => preact.JSX.Element
}) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {rows.length === 0 ? (
        <Card>
          <p class="text-sm text-content-muted">{empty}</p>
        </Card>
      ) : (
        <Card padded={false}>
          <RowList>
            {rows.map((row) => (
              <li key={row.id} class="space-y-1 px-gutter py-3">
                <div class="flex items-center justify-between gap-3">
                  <span class="min-w-0 truncate text-sm font-medium">{row.label}</span>
                  <span
                    class={`shrink-0 text-sm font-semibold tabular-nums ${
                      row.grossProfitMinor < 0 ? 'text-danger' : ''
                    }`}
                  >
                    {formatMinor(row.grossProfitMinor, currency)}
                  </span>
                </div>
                <div class="flex items-center justify-between gap-3 text-xs text-content-muted">
                  <span>
                    Revenue {formatMinor(row.revenueMinor, currency)} · Cost{' '}
                    {formatMinor(row.costMinor, currency)}
                    {row.marginPct !== null && ` · ${row.marginPct.toFixed(0)}% margin`}
                  </span>
                </div>
                {renderExtra?.(row)}
              </li>
            ))}
          </RowList>
        </Card>
      )}
    </section>
  )
}
