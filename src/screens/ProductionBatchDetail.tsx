/* One production batch: progress, quality control, costing. Online-only. */
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
} from '../ui'
import { IconEdit, IconPlus, IconTrash } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useQuery, useQueryStatus } from '../hooks/useQuery'
import { formatMinor } from '../lib/money'
import {
  addBatchCost,
  observeBatchCosts,
  observeProduct,
  observeProductionBatch,
  removeBatchCost,
  summarizeBatchCosts,
  updateBatchProgress,
  type BatchProgressInput,
} from '../db/repo'
import {
  BATCH_STATUSES,
  COST_TYPES,
  type BatchStatus,
  type CostType,
  type ProductionBatch,
} from '../db/schema'
import { useBack } from '../hooks/useBack'
import { useDraft } from '../hooks/useDraft'

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

interface ProgressDraft {
  status: BatchStatus
  produced: string
  accepted: string
  rejected: string
  rejectedReason: string
  notes: string
}

interface CostDraft {
  costType: CostType
  description: string
  amount: string
}

export function ProductionBatchDetail() {
  const back = useBack()
  const { params } = useRoute()
  const batchId = params.id ?? ''
  const { db, shop } = useCurrentShop()
  const [editingProgress, setEditingProgress] = useState(false)
  const [addingCost, setAddingCost] = useState(false)

  const found = useQueryStatus(() => observeProductionBatch(db, batchId), [db, batchId], null)
  const batch = found.value
  const costs = useQuery(() => observeBatchCosts(db, batchId), [db, batchId], [])
  const product = useQuery(
    () => observeProduct(db, batch?.product_id ?? '__none__'),
    [db, batch?.product_id],
    null,
  )

  if (!found.loaded) {
    return (
      <Screen title="Batch" back={back}>
        <Skeleton class="h-32" />
      </Screen>
    )
  }
  if (!batch) {
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
                          onClick={() => void removeBatchCost(db, cost.id)}
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
      />
      <AddCostSheet
        open={addingCost}
        shopId={shop.id}
        batchId={batch.id}
        onClose={() => setAddingCost(false)}
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
}: {
  open: boolean
  batch: ProductionBatch
  onClose: () => void
}) {
  const progressOf = (source: ProductionBatch): ProgressDraft => ({
    status: source.status,
    produced: String(source.produced_quantity),
    accepted: String(source.accepted_quantity),
    rejected: String(source.rejected_quantity),
    rejectedReason: source.rejected_reason ?? '',
    notes: source.notes ?? '',
  })
  const { draft, set, reset } = useDraft<ProgressDraft>(() => progressOf(batch))
  const { db } = useCurrentShop()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    reset(progressOf(batch))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch])

  async function submit(event: Event) {
    event.preventDefault()
    const input: BatchProgressInput = {
      status: draft.status,
      produced_quantity: Math.max(0, Math.round(Number(draft.produced) || 0)),
      accepted_quantity: Math.max(0, Math.round(Number(draft.accepted) || 0)),
      rejected_quantity: Math.max(0, Math.round(Number(draft.rejected) || 0)),
      rejected_reason: draft.rejectedReason,
      notes: draft.notes,
    }
    if (input.rejected_quantity > 0 && !draft.rejectedReason.trim()) {
      setError('A rejected quantity needs a reason.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateBatchProgress(db, batch.id, input, batch.status)
      onClose()
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
          <Select value={draft.status} onValue={(v) => set('status', v as BatchStatus)}>
            {BATCH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Produced">
          <Input type="number" inputmode="numeric" value={draft.produced} onValue={(v) => set('produced', v)} />
        </Field>

        <div class="flex gap-3">
          <div class="flex-1">
            <Field label="Accepted">
              <Input
                type="number"
                inputmode="numeric"
                value={draft.accepted}
                onValue={(v) => set('accepted', v)}
              />
            </Field>
          </div>
          <div class="flex-1">
            <Field label="Rejected">
              <Input
                type="number"
                inputmode="numeric"
                value={draft.rejected}
                onValue={(v) => set('rejected', v)}
              />
            </Field>
          </div>
        </div>

        <Field label="Rejection reason" hint={Number(draft.rejected) > 0 ? 'Required when anything is rejected.' : 'Optional.'}>
          <Input value={draft.rejectedReason} onValue={(v) => set('rejectedReason', v)} />
        </Field>

        <Field label="Notes" hint="Optional.">
          <Textarea value={draft.notes} onValue={(v) => set('notes', v)} />
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
}: {
  open: boolean
  shopId: string
  batchId: string
  onClose: () => void
}) {
  const { db } = useCurrentShop()
  const { draft: cost, set: setCost, reset: resetCost } = useDraft<CostDraft>(() => ({
    costType: 'materials',
    description: '',
    amount: '0',
  }))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addBatchCost(db, shopId, batchId, {
        cost_type: cost.costType,
        description: cost.description,
        amount_minor: Math.max(0, Math.round(Number(cost.amount) || 0)),
      })
      resetCost({ costType: cost.costType, description: '', amount: '0' })
      onClose()
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
          <Select value={cost.costType} onValue={(v) => setCost('costType', v as CostType)}>
            {COST_TYPES.map((type) => (
              <option key={type} value={type}>
                {COST_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" hint="Optional.">
          <Input value={cost.description} onValue={(v) => setCost('description', v)} />
        </Field>
        <Field label="Amount (minor units)">
          <Input type="number" inputmode="numeric" value={cost.amount} onValue={(v) => setCost('amount', v)} />
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
