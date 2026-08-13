/* One item: its running quantity and movement history. Every change happens by
   recording a movement -- there is deliberately no direct edit. */
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
  Select,
  Sheet,
  Skeleton,
  Textarea,
} from '../ui'
import { IconPlus } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useOnlineFeature } from '../hooks/useOnlineFeature'
import { withTimeout } from '../lib/withTimeout'
import { formatDate } from '../lib/dates'
import {
  MOVEMENT_TYPES,
  listInventoryItems,
  listMovements,
  recordMovement,
  type InventoryItem,
  type InventoryMovement,
  type MovementType,
} from '../online/inventory'
import { listAllProductVariants, listProducts, type Product, type ProductVariant } from '../online/catalogue'
import { listMaterials, type Material } from '../online/materials'
import { useBack } from '../hooks/useBack'

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

export function InventoryItemDetail() {
  const back = useBack()
  const { params } = useRoute()
  const itemId = params.id ?? ''
  const { shop } = useCurrentShop()
  const online = useOnlineFeature()

  const [item, setItem] = useState<InventoryItem | null | undefined>(undefined)
  const [label, setLabel] = useState('')
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)

  async function reload() {
    try {
      const [items, variants, products, materials, moves] = await withTimeout(
        Promise.all([
          listInventoryItems(shop.id),
          listAllProductVariants(shop.id),
          listProducts(shop.id),
          listMaterials(shop.id),
          listMovements(itemId),
        ]),
        8000,
        'No response from the server. Check your connection and try again.',
      )
      const found = items.find((i) => i.id === itemId) ?? null
      setItem(found)
      if (found) setLabel(describeItem(found, variants, products, materials))
      setMovements(moves)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load this item.')
    }
  }

  useEffect(() => {
    if (online) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, itemId])

  if (!online) {
    return (
      <Screen title="Inventory item" back={back}>
        <EmptyState spacious title="No connection" description="This needs a connection to load." />
      </Screen>
    )
  }
  if (loadError) {
    return (
      <Screen title="Inventory item" back={back}>
        <ErrorNote>{loadError}</ErrorNote>
      </Screen>
    )
  }
  if (item === undefined) {
    return (
      <Screen title="Inventory item" back={back}>
        <Skeleton class="h-32" />
      </Screen>
    )
  }
  if (item === null) {
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

      <RecordMovementSheet
        open={recording}
        item={item}
        onClose={() => setRecording(false)}
        onSaved={reload}
      />
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
  onSaved,
}: {
  open: boolean
  item: InventoryItem
  onClose: () => void
  onSaved: () => void
}) {
  const { shop } = useCurrentShop()
  const [movementType, setMovementType] = useState<MovementType>('adjustment')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    const qty = Math.round(Number(quantity) || 0)
    if (qty === 0) {
      setError('Enter a non-zero quantity -- positive to add stock, negative to remove it.')
      return
    }
    if (movementType === 'adjustment' && !reason.trim()) {
      setError('An adjustment needs a reason.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await recordMovement(shop.id, item.id, {
        movement_type: movementType,
        quantity: qty,
        reason,
        notes,
      })
      setQuantity('')
      setReason('')
      setNotes('')
      onClose()
      onSaved()
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
            value={movementType}
            onChange={(e) => setMovementType((e.target as HTMLSelectElement).value as MovementType)}
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
            value={quantity}
            onInput={(e) => setQuantity((e.target as HTMLInputElement).value)}
          />
        </Field>

        <Field label="Reason" hint={movementType === 'adjustment' ? 'Required for an adjustment.' : 'Optional.'}>
          <Input value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} />
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
            {saving ? 'Saving...' : 'Record'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
