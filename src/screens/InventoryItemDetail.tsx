/* One item: its running quantity and movement history. Every change happens by
   recording a movement -- there is deliberately no direct edit. */
import { useMemo, useState } from 'preact/hooks'
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
  Select,
  Sheet,
  Skeleton,
  Textarea,
} from '../ui'
import { IconPlus } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useQuery, useQueryStatus } from '../hooks/useQuery'
import { formatDate } from '../lib/dates'
import {
  observeAllProductVariants,
  observeInventoryItem,
  observeMaterials,
  observeMovements,
  observeProducts,
  recordMovement,
} from '../db/repo'
import {
  MOVEMENT_TYPES,
  type InventoryItem,
  type Material,
  type MovementType,
  type Product,
  type ProductVariant,
} from '../db/schema'
import { useBack } from '../hooks/useBack'
import { useDraft } from '../hooks/useDraft'

const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  purchase: 'Purchase',
  production: 'Production',
  sale: 'Sale',
  order_reservation: 'Order reservation',
  order_fulfilment: 'Order fulfilment',
  return: 'Return',
  damage: 'Damage',
  loss: 'Loss',
  adjustment: 'Adjustment',
  sample: 'Sample',
  repair: 'Repair',
}

interface MovementDraft {
  movementType: MovementType
  quantity: string
  reason: string
  notes: string
}

export function InventoryItemDetail() {
  const back = useBack()
  const { params } = useRoute()
  const itemId = params.id ?? ''
  const { db, shop } = useCurrentShop()
  const [recording, setRecording] = useState(false)

  const found = useQueryStatus(() => observeInventoryItem(db, itemId), [db, itemId], null)
  const item = found.value
  const movements = useQuery(() => observeMovements(db, itemId), [db, itemId], [])
  const variants = useQuery(() => observeAllProductVariants(db, shop.id), [db, shop.id], [])
  const products = useQuery(() => observeProducts(db, shop.id), [db, shop.id], [])
  const materials = useQuery(() => observeMaterials(db, shop.id), [db, shop.id], [])

  const label = useMemo(
    () => (item ? describeItem(item, variants, products, materials) : ''),
    [item, variants, products, materials],
  )

  if (!found.loaded) {
    return (
      <Screen title="Inventory item" back={back}>
        <Skeleton class="h-32" />
      </Screen>
    )
  }
  if (!item) {
    return (
      <Screen title="Inventory item" back={back}>
        <EmptyState
          spacious
          title="Not found"
          description="It may have been removed."
          action={
            <Button linkTo="/inventory" variant="secondary">
              Back to inventory
            </Button>
          }
        />
      </Screen>
    )
  }

  return (
    <>
      <Screen title={label} back={back}>
        <div class="space-y-5">
          <Card>
            <p class="text-sm text-content-muted">On hand</p>
            <p class="mt-1 text-3xl font-bold tabular-nums">
              {item.quantity} <span class="text-base font-normal text-content-muted">{item.unit}</span>
            </p>
            <Button class="mt-3" onClick={() => setRecording(true)}>
              <IconPlus size={16} /> Record movement
            </Button>
          </Card>

          <section>
            <p class="mb-2 px-1 text-xs font-semibold tracking-wide text-content-muted">Movement history</p>
            {movements.length === 0 ? (
              <Card>
                <p class="text-sm text-content-muted">No movements recorded yet.</p>
              </Card>
            ) : (
              <Card padded={false}>
                <RowList>
                  {movements.map((movement) => (
                    <li key={movement.id} class="flex items-center gap-3 px-gutter py-3">
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium">
                          {MOVEMENT_TYPE_LABELS[movement.movement_type]}
                          {movement.reason && (
                            <span class="font-normal text-content-muted"> — {movement.reason}</span>
                          )}
                        </span>
                        <span class="block truncate text-sm text-content-muted">
                          {formatDate(movement.created_at.slice(0, 10))}
                          {movement.notes ? ` · ${movement.notes}` : ''}
                        </span>
                      </span>
                      <span
                        class={`shrink-0 font-semibold tabular-nums ${movement.quantity > 0 ? 'text-money' : 'text-danger'}`}
                      >
                        {movement.quantity > 0 ? '+' : ''}
                        {movement.quantity}
                      </span>
                    </li>
                  ))}
                </RowList>
              </Card>
            )}
          </section>
        </div>
      </Screen>

      <RecordMovementSheet open={recording} item={item} onClose={() => setRecording(false)} />
    </>
  )
}

function describeItem(
  item: InventoryItem,
  variants: ProductVariant[],
  products: Product[],
  materials: Material[],
): string {
  if (item.item_type === 'material') {
    return materials.find((m) => m.id === item.material_id)?.name ?? 'Unknown material'
  }
  const variant = variants.find((v) => v.id === item.product_variant_id)
  if (!variant) return 'Unknown variant'
  const product = products.find((p) => p.id === variant.product_id)
  return [product?.name, variant.sku].filter(Boolean).join(' · ')
}

function RecordMovementSheet({
  open,
  item,
  onClose,
}: {
  open: boolean
  item: InventoryItem
  onClose: () => void
}) {
  const { db, shop } = useCurrentShop()
  const { draft, set, patch } = useDraft<MovementDraft>(() => ({
    movementType: 'adjustment',
    quantity: '',
    reason: '',
    notes: '',
  }))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    const qty = Math.round(Number(draft.quantity) || 0)
    if (qty === 0) {
      setError('Enter a non-zero quantity -- positive to add stock, negative to remove it.')
      return
    }
    if (draft.movementType === 'adjustment' && !draft.reason.trim()) {
      setError('An adjustment needs a reason.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await recordMovement(db, shop.id, item.id, {
        movement_type: draft.movementType,
        quantity: qty,
        reason: draft.reason,
        notes: draft.notes,
      })
      patch({ quantity: '', reason: '', notes: '' })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record that movement.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title="Record movement" onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Type">
          <Select
            value={draft.movementType}
            onValue={(v) => set('movementType', v as MovementType)}
          >
            {MOVEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {MOVEMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Quantity" hint="Positive adds stock, negative removes it.">
          <Input
            type="number"
            inputmode="numeric"
            value={draft.quantity}
            onValue={(v) => set('quantity', v)}
          />
        </Field>

        <Field label="Reason" hint={draft.movementType === 'adjustment' ? 'Required for an adjustment.' : 'Optional.'}>
          <Input value={draft.reason} onValue={(v) => set('reason', v)} />
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
            {saving ? 'Saving...' : 'Record'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
