/* Production batches. Online-only (see src/online/production.ts). */
import { useEffect, useMemo, useState } from 'preact/hooks'
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  HeaderAction,
  Input,
  RowList,
  Screen,
  Select,
  Sheet,
  Skeleton,
  Textarea,
} from '../ui'
import { IconBox, IconChevronRight, IconPlus } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useOnlineFeature } from '../hooks/useOnlineFeature'
import { withTimeout } from '../lib/withTimeout'
import {
  createProductionBatch,
  listProductionBatches,
  type BatchStatus,
  type ProductionBatch,
} from '../online/production'
import { listProducts, type Product } from '../online/catalogue'
import { useBack } from '../hooks/useBack'

const STATUS_LABELS: Record<BatchStatus, string> = {
  planned: 'Planned',
  materials_ready: 'Materials ready',
  in_production: 'In production',
  quality_control: 'Quality control',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export function Production() {
  const back = useBack()
  const { shop } = useCurrentShop()
  const online = useOnlineFeature()
  const [batches, setBatches] = useState<ProductionBatch[] | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function reload() {
    try {
      const [batchList, productList] = await withTimeout(
        Promise.all([listProductionBatches(shop.id), listProducts(shop.id)]),
        8000,
        'No response from the server. Check your connection and try again.',
      )
      setBatches(batchList)
      setProducts(productList)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load production batches.')
    }
  }

  useEffect(() => {
    if (online) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, shop.id])

  const productName = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p.name]))
    return (id: string) => byId.get(id) ?? 'Unknown product'
  }, [products])

  if (!online) {
    return (
      <Screen title="Production" back={back}>
        <EmptyState spacious illustration={<IconBox size={48} />} title="No connection" description="Production lives on the server, so this needs a connection to load." />
      </Screen>
    )
  }

  return (
    <>
      <Screen
        title="Production"
        back={back}
        action={
          batches && batches.length > 0 ? (
            <HeaderAction label="Add" icon={<IconPlus size={16} />} onClick={() => setAdding(true)} />
          ) : undefined
        }
      >
        <div class="space-y-4">
          {loadError && <ErrorNote>{loadError}</ErrorNote>}

          {batches === null && !loadError && (
            <div class="space-y-2">
              <Skeleton class="h-14" />
              <Skeleton class="h-14" />
            </div>
          )}

          {batches && batches.length === 0 && (
            <EmptyState
              spacious
              illustration={<IconBox size={48} />}
              title="No batches yet"
              description="Plan a production run against one of your products, then track it through to completion."
              action={
                <Button onClick={() => setAdding(true)}>
                  <IconPlus size={18} /> Add a batch
                </Button>
              }
            />
          )}

          {batches && batches.length > 0 && (
            <Card padded={false}>
              <RowList>
                {batches.map((batch) => (
                  <li key={batch.id}>
                    <a
                      href={`/production/${batch.id}`}
                      class="flex min-h-tap items-center gap-3 px-gutter py-3 transition-colors hover:bg-hover active:bg-pressed"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium">{batch.batch_number}</span>
                        <span class="block truncate text-sm text-content-muted">
                          {productName(batch.product_id)} · {STATUS_LABELS[batch.status]} ·{' '}
                          {batch.produced_quantity}/{batch.planned_quantity} produced
                        </span>
                      </span>
                      <IconChevronRight size={18} class="shrink-0 text-content-subtle" />
                    </a>
                  </li>
                ))}
              </RowList>
            </Card>
          )}
        </div>
      </Screen>

      <AddBatchSheet open={adding} products={products} onClose={() => setAdding(false)} onSaved={reload} />
    </>
  )
}

function AddBatchSheet({
  open,
  products,
  onClose,
  onSaved,
}: {
  open: boolean
  products: Product[]
  onClose: () => void
  onSaved: () => void
}) {
  const { shop, activeStaff } = useCurrentShop()
  const [productId, setProductId] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [plannedQuantity, setPlannedQuantity] = useState('0')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    if (!productId) {
      setError('Choose a product.')
      return
    }
    if (!batchNumber.trim()) {
      setError('Give the batch a number.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createProductionBatch(
        shop.id,
        {
          product_id: productId,
          batch_number: batchNumber,
          planned_quantity: Math.max(0, Math.round(Number(plannedQuantity) || 0)),
          notes,
        },
        activeStaff?.id,
      )
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this batch.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title="New batch" onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Product">
          <Select value={productId} onValue={setProductId}>
            <option value="">Choose a product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Batch number" hint='e.g. "F002-B01".'>
          <Input value={batchNumber} onValue={setBatchNumber} />
        </Field>
        <Field label="Planned quantity">
          <Input
            type="number"
            inputmode="numeric"
            value={plannedQuantity}
            onValue={setPlannedQuantity}
          />
        </Field>
        <Field label="Notes" hint="Optional.">
          <Textarea value={notes} onValue={setNotes} />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save batch'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
