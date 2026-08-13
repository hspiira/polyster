/**
 * Batch/product/collection profitability and inventory valuation
 * (Phase 11, section 82). Online-only (see src/online/analytics.ts).
 *
 * "Keep calculations transparent": revenue below is counted at each sold
 * garment unit's list price, not a reconciled transaction amount -- the
 * catalogue's own info note says why.
 */
import { useEffect, useState } from 'preact/hooks'
import { Card, EmptyState, ErrorNote, InfoNote, RowList, Screen, SectionTitle, Skeleton } from '../components/ui'
import { IconChart } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useOnlineFeature } from '../hooks/useOnlineFeature'
import { withTimeout } from '../lib/withTimeout'
import { formatMinor } from '../lib/money'
import {
  loadAnalyticsBundle,
  batchProfitability,
  productProfitability,
  collectionPerformance,
  inventoryValuation,
  type ProfitabilityRow,
  type CollectionPerformanceRow,
  type InventoryValuation,
} from '../online/analytics'
import { useBack } from '../hooks/useBack'

export function AdvancedReports() {
  const back = useBack()
  const { shop } = useCurrentShop()
  const online = useOnlineFeature()
  const [batches, setBatches] = useState<ProfitabilityRow[] | null>(null)
  const [products, setProducts] = useState<ProfitabilityRow[] | null>(null)
  const [collections, setCollections] = useState<CollectionPerformanceRow[] | null>(null)
  const [inventory, setInventory] = useState<InventoryValuation | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currency, setCurrency] = useState(shop.currency)

  useEffect(() => {
    if (!online) return
    let cancelled = false
    withTimeout(
      loadAnalyticsBundle(shop.id),
      8000,
      'No response from the server. Check your connection and try again.',
    )
      .then((bundle) => {
        if (cancelled) return
        setBatches(batchProfitability(bundle))
        setProducts(productProfitability(bundle))
        setCollections(collectionPerformance(bundle))
        setInventory(inventoryValuation(bundle))
        setCurrency(shop.currency)
        setLoadError(null)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load these reports.')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, shop.id])

  if (!online) {
    return (
      <Screen title="Advanced reports" back={back}>
        <EmptyState
          spacious
          illustration={<IconChart size={48} />}
          title="No connection"
          description="These reports draw on the catalogue and production data on the server, so they need a connection to load."
        />
      </Screen>
    )
  }

  const loaded = batches && products && collections && inventory

  return (
    <Screen title="Advanced reports" back={back}>
      <div class="space-y-5">
        {loadError && <ErrorNote>{loadError}</ErrorNote>}

        {!loaded && !loadError && (
          <div class="space-y-2">
            <Skeleton class="h-14" />
            <Skeleton class="h-14" />
            <Skeleton class="h-14" />
          </div>
        )}

        {loaded && (
          <>
            <section>
              <SectionTitle>Inventory valuation</SectionTitle>
              <Card>
                <dl class="space-y-1.5 text-sm">
                  <div class="flex justify-between gap-4">
                    <dt class="text-content-muted">Finished goods, at cost</dt>
                    <dd class="font-medium tabular-nums">
                      {formatMinor(inventory.finishedGoodsValueMinor, currency)}
                    </dd>
                  </div>
                  <div class="flex justify-between gap-4">
                    <dt class="text-content-muted">Materials, at cost</dt>
                    <dd class="font-medium tabular-nums">
                      {formatMinor(inventory.materialsValueMinor, currency)}
                    </dd>
                  </div>
                  <div class="flex justify-between gap-4 border-t border-stone-100 pt-1.5 dark:border-stone-800">
                    <dt class="text-content-muted">Total</dt>
                    <dd class="font-semibold tabular-nums">
                      {formatMinor(inventory.totalValueMinor, currency)}
                    </dd>
                  </div>
                </dl>
              </Card>
            </section>

            <ProfitabilitySection
              title="Collection performance"
              empty="No collections yet."
              currency={currency}
              rows={collections}
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
              rows={products}
            />

            <ProfitabilitySection
              title="Batch profitability"
              empty="No production batches yet."
              currency={currency}
              rows={batches}
            />

            <InfoNote>
              Revenue is counted at each sold garment's list price, not a reconciled sale amount --
              sales and payments do not carry a product link to total up any other way. Production
              cost comes from the cost lines recorded against each batch.
            </InfoNote>
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
                      row.grossProfitMinor < 0 ? 'text-red-700 dark:text-red-400' : ''
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
