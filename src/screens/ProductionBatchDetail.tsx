/**
 * One production batch: progress, quality control, and costing. Online-only.
 */
import { useEffect, useState } from 'preact/hooks'
import { useRoute } from 'preact-iso'
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  RowList,
  Screen,
  SectionTitle,
  Select,
  Sheet,
  Skeleton,
  Textarea,
} from '../components/ui'
import { IconEdit, IconPlus, IconTrash } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useOnlineFeature } from '../hooks/useOnlineFeature'
import { withTimeout } from '../lib/withTimeout'
import { formatMinor } from '../lib/money'
import {
  BATCH_STATUSES,
  COST_TYPES,
  addBatchCost,
  getProductionBatch,
  listBatchCosts,
  removeBatchCost,
  summarizeBatchCosts,
  updateBatchProgress,
  type BatchProgressInput,
  type BatchStatus,
  type CostType,
  type ProductionBatch,
  type ProductionBatchCost,
} from '../online/production'
import { getProduct, type Product } from '../online/catalogue'
import { useBack } from '../hooks/useBack'

const STATUS_LABELS: Record<BatchStatus, string> = {
  planned: 'Planned',
  materials_ready: 'Materials ready',
  in_production: 'In production',
  quality_control: 'Quality control',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const COST_TYPE_LABELS: Record<CostType, string> = {
  materials: 'Materials',
  labour: 'Labour',
  transport: 'Transport',
  packaging: 'Packaging',
  labels: 'Labels',
  quality_control: 'Quality control',
  other: 'Other',
}

export function ProductionBatchDetail() {
  const back = useBack()
  const { params } = useRoute()
  const batchId = params.id ?? ''
  const { shop } = useCurrentShop()
  const online = useOnlineFeature()

  const [batch, setBatch] = useState<ProductionBatch | null | undefined>(undefined)
  const [product, setProduct] = useState<Product | null>(null)
  const [costs, setCosts] = useState<ProductionBatchCost[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingProgress, setEditingProgress] = useState(false)
  const [addingCost, setAddingCost] = useState(false)

  async function reload() {
    try {
      const found = await withTimeout(getProductionBatch(batchId), 8000, 'No response from the server.')
      setBatch(found)
      if (found) {
        const [prod, costList] = await Promise.all([getProduct(found.product_id), listBatchCosts(found.id)])
        setProduct(prod)
        setCosts(costList)
      }
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load this batch.')
    }
  }

  useEffect(() => {
    if (online) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, batchId])

  if (!online) {
    return (
      <Screen title="Batch" back={back}>
        <EmptyState spacious title="No connection" description="This needs a connection to load." />
      </Screen>
    )
  }
  if (loadError) {
    return (
      <Screen title="Batch" back={back}>
        <ErrorNote>{loadError}</ErrorNote>
      </Screen>
    )
  }
  if (batch === undefined) {
    return (
      <Screen title="Batch" back={back}>
        <Skeleton class="h-32" />
      </Screen>
    )
  }
  if (batch === null) {
    return (
      <Screen title="Batch" back={back}>
        <EmptyState
          spacious
          title="Not found"
          description="It may have been removed."
          action={
            <Button linkTo="/production" variant="secondary">
              Back to production
            </Button>
          }
        />
      </Screen>
    )
  }

  const summary = summarizeBatchCosts(costs, batch.accepted_quantity)

  return (
    <>
      <Screen
        title={batch.batch_number}
        back={back}
        action={
          <Button variant="ghost" size="sm" aria-label="Update progress" onClick={() => setEditingProgress(true)}>
            <IconEdit size={20} />
          </Button>
        }
      >
        <div class="space-y-5">
          <Card>
            <div class="space-y-2 text-sm">
              <Row label="Product" value={product?.name ?? '...'} />
              <Row label="Status" value={STATUS_LABELS[batch.status]} />
              <Row label="Planned" value={String(batch.planned_quantity)} />
              <Row label="Produced" value={String(batch.produced_quantity)} />
              <Row label="Accepted" value={String(batch.accepted_quantity)} />
              <Row label="Rejected" value={String(batch.rejected_quantity)} />
              {batch.rejected_reason && <Row label="Rejection reason" value={batch.rejected_reason} />}
              {batch.notes && <Row label="Notes" value={batch.notes} />}
            </div>
          </Card>

          <section>
            <SectionTitle
              action={
                <Button size="sm" onClick={() => setAddingCost(true)}>
                  <IconPlus size={16} /> Add cost
                </Button>
              }
            >
              Costs
            </SectionTitle>

            {costs.length === 0 ? (
              <Card>
                <p class="text-sm text-content-muted">No costs recorded yet.</p>
              </Card>
            ) : (
              <>
                <Card padded={false}>
                  <RowList>
                    {costs.map((cost) => (
                      <li key={cost.id} class="flex items-center gap-3 px-gutter py-3">
                        <span class="min-w-0 flex-1">
                          <span class="block truncate font-medium">{COST_TYPE_LABELS[cost.cost_type]}</span>
                          {cost.description && (
                            <span class="block truncate text-sm text-content-muted">{cost.description}</span>
                          )}
                        </span>
                        <span class="shrink-0 font-medium tabular-nums">
                          {formatMinor(cost.amount_minor, cost.currency)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Remove cost"
                          onClick={() => void removeBatchCost(cost.id).then(reload)}
                        >
                          <IconTrash size={16} />
                        </Button>
                      </li>
                    ))}
                  </RowList>
                </Card>

                <Card class="mt-3">
                  <div class="space-y-1 text-sm">
                    <Row label="Total cost" value={formatMinor(summary.totalMinor, costs[0]?.currency ?? 'UGX')} />
                    <Row label="Usable units" value={String(summary.usableUnits)} />
                    <Row
                      label="Cost per unit"
                      value={
                        summary.costPerUnitMinor !== null
                          ? formatMinor(summary.costPerUnitMinor, costs[0]?.currency ?? 'UGX')
                          : 'n/a (no accepted units)'
                      }
                    />
                  </div>
                </Card>
              </>
            )}
          </section>
        </div>
      </Screen>

      <ProgressSheet
        open={editingProgress}
        batch={batch}
        onClose={() => setEditingProgress(false)}
        onSaved={reload}
      />
      <AddCostSheet
        open={addingCost}
        shopId={shop.id}
        batchId={batch.id}
        onClose={() => setAddingCost(false)}
        onSaved={reload}
      />
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div class="flex justify-between gap-4">
      <span class="text-content-muted">{label}</span>
      <span class="text-right font-medium">{value}</span>
    </div>
  )
}

function ProgressSheet({
  open,
  batch,
  onClose,
  onSaved,
}: {
  open: boolean
  batch: ProductionBatch
  onClose: () => void
  onSaved: () => void
}) {
  const [status, setStatus] = useState<BatchStatus>(batch.status)
  const [produced, setProduced] = useState(String(batch.produced_quantity))
  const [accepted, setAccepted] = useState(String(batch.accepted_quantity))
  const [rejected, setRejected] = useState(String(batch.rejected_quantity))
  const [rejectedReason, setRejectedReason] = useState(batch.rejected_reason ?? '')
  const [notes, setNotes] = useState(batch.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setStatus(batch.status)
    setProduced(String(batch.produced_quantity))
    setAccepted(String(batch.accepted_quantity))
    setRejected(String(batch.rejected_quantity))
    setRejectedReason(batch.rejected_reason ?? '')
    setNotes(batch.notes ?? '')
  }, [batch])

  async function submit(event: Event) {
    event.preventDefault()
    const input: BatchProgressInput = {
      status,
      produced_quantity: Math.max(0, Math.round(Number(produced) || 0)),
      accepted_quantity: Math.max(0, Math.round(Number(accepted) || 0)),
      rejected_quantity: Math.max(0, Math.round(Number(rejected) || 0)),
      rejected_reason: rejectedReason,
      notes,
    }
    if (input.rejected_quantity > 0 && !rejectedReason.trim()) {
      setError('A rejected quantity needs a reason.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateBatchProgress(batch.id, input, batch.status)
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this update.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title="Update progress" onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value as BatchStatus)}>
            {BATCH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Produced">
          <Input type="number" inputmode="numeric" value={produced} onInput={(e) => setProduced((e.target as HTMLInputElement).value)} />
        </Field>

        <div class="flex gap-3">
          <div class="flex-1">
            <Field label="Accepted">
              <Input
                type="number"
                inputmode="numeric"
                value={accepted}
                onInput={(e) => setAccepted((e.target as HTMLInputElement).value)}
              />
            </Field>
          </div>
          <div class="flex-1">
            <Field label="Rejected">
              <Input
                type="number"
                inputmode="numeric"
                value={rejected}
                onInput={(e) => setRejected((e.target as HTMLInputElement).value)}
              />
            </Field>
          </div>
        </div>

        <Field label="Rejection reason" hint={Number(rejected) > 0 ? 'Required when anything is rejected.' : 'Optional.'}>
          <Input value={rejectedReason} onInput={(e) => setRejectedReason((e.target as HTMLInputElement).value)} />
        </Field>

        <Field label="Notes" hint="Optional.">
          <Textarea value={notes} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function AddCostSheet({
  open,
  shopId,
  batchId,
  onClose,
  onSaved,
}: {
  open: boolean
  shopId: string
  batchId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [costType, setCostType] = useState<CostType>('materials')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addBatchCost(shopId, batchId, {
        cost_type: costType,
        description,
        amount_minor: Math.max(0, Math.round(Number(amount) || 0)),
      })
      setDescription('')
      setAmount('0')
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this cost.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title="Add cost" onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Type">
          <Select value={costType} onChange={(e) => setCostType((e.target as HTMLSelectElement).value as CostType)}>
            {COST_TYPES.map((type) => (
              <option key={type} value={type}>
                {COST_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" hint="Optional.">
          <Input value={description} onInput={(e) => setDescription((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Amount (minor units)">
          <Input type="number" inputmode="numeric" value={amount} onInput={(e) => setAmount((e.target as HTMLInputElement).value)} />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save cost'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
