/* Finished goods and materials, tracked as a ledger. */
import { useMemo, useState } from 'preact/hooks'
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
  Segmented,
  Select,
  Sheet,
} from '../ui'
import { IconChevronRight, IconPlus, IconReceipt } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useQuery } from '../hooks/useQuery'
import {
  getOrCreateInventoryItem,
  observeAllProductVariants,
  observeInventoryItems,
  observeMaterials,
  observeProducts,
  recordMovement,
} from '../db/repo'
import type {
  InventoryItem,
  ItemType,
  Material,
  Product,
  ProductVariant,
} from '../db/schema'
import { useBack } from '../hooks/useBack'
import { useDraft } from '../hooks/useDraft'

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'product_variant', label: 'Finished goods' },
  { value: 'material', label: 'Materials' },
] as const

interface InventoryDraft {
  itemType: ItemType
  refId: string
  startingQuantity: string
}

export function Inventory() {
  const back = useBack()
  const { db, shop } = useCurrentShop()
  const [scope, setScope] = useState<'all' | ItemType>('all')
  const [tracking, setTracking] = useState(false)

  const items = useQuery(() => observeInventoryItems(db, shop.id), [db, shop.id], [])
  const variants = useQuery(() => observeAllProductVariants(db, shop.id), [db, shop.id], [])
  const products = useQuery(() => observeProducts(db, shop.id), [db, shop.id], [])
  const materials = useQuery(() => observeMaterials(db, shop.id), [db, shop.id], [])

  const label = useMemo(() => {
    const variantById = new Map(variants.map((v) => [v.id, v]))
    const productById = new Map(products.map((p) => [p.id, p]))
    const materialById = new Map(materials.map((m) => [m.id, m]))
    return (item: InventoryItem): string => {
      if (item.item_type === 'material') {
        return materialById.get(item.material_id ?? '')?.name ?? 'Unknown material'
      }
      const variant = variantById.get(item.product_variant_id ?? '')
      if (!variant) return 'Unknown variant'
      const product = productById.get(variant.product_id)
      return [product?.name, variant.sku].filter(Boolean).join(' · ')
    }
  }, [variants, products, materials])

  const filtered = useMemo(
    () => (scope === 'all' ? items : items.filter((item) => item.item_type === scope)),
    [items, scope],
  )

  return (
    <>
      <Screen
        title="Inventory"
        back={back}
        action={<HeaderAction label="Track item" icon={<IconPlus size={16} />} onClick={() => setTracking(true)} />}
      >
        <div class="space-y-4">
          {items.length > 0 && (
            <Segmented value={scope} options={SCOPE_OPTIONS} onChange={setScope} label="Scope" />
          )}

          {items.length === 0 && (
            <EmptyState
              spacious
              illustration={<IconReceipt size={48} />}
              title="Nothing tracked yet"
              description="Start tracking a product variant or a material to record purchases, sales, damage and adjustments against it."
              action={
                <Button onClick={() => setTracking(true)}>
                  <IconPlus size={18} /> Track an item
                </Button>
              }
            />
          )}

          {filtered.length > 0 && (
            <Card padded={false}>
              <RowList>
                {filtered.map((item) => {
                  const material = item.item_type === 'material' ? materials.find((m) => m.id === item.material_id) : undefined
                  const low = material && item.quantity <= material.reorder_level
                  return (
                    <li key={item.id}>
                      <a
                        href={`/inventory/${item.id}`}
                        class="flex min-h-tap items-center gap-3 px-gutter py-3 transition-colors
                               hover:bg-hover active:bg-pressed"
                      >
                        <span class="min-w-0 flex-1">
                          <span class="block truncate font-medium">
                            {label(item)}
                            {low && <span class="ml-2 text-xs font-normal text-danger">Low stock</span>}
                          </span>
                          <span class="block truncate text-sm text-content-muted">
                            {item.quantity} {item.unit}
                          </span>
                        </span>
                        <IconChevronRight size={18} class="shrink-0 text-content-subtle" />
                      </a>
                    </li>
                  )
                })}
              </RowList>
            </Card>
          )}
        </div>
      </Screen>

      <TrackItemSheet
        open={tracking}
        variants={variants}
        products={products}
        materials={materials}
        existing={items}
        onClose={() => setTracking(false)}
      />
    </>
  )
}

function TrackItemSheet({
  open,
  variants,
  products,
  materials,
  existing,
  onClose,
}: {
  open: boolean
  variants: ProductVariant[]
  products: Product[]
  materials: Material[]
  existing: InventoryItem[]
  onClose: () => void
}) {
  const { db, shop } = useCurrentShop()
  const { draft, set, patch } = useDraft<InventoryDraft>(() => ({
    itemType: 'product_variant',
    refId: '',
    startingQuantity: '0',
  }))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const trackedVariantIds = new Set(existing.map((i) => i.product_variant_id).filter(Boolean))
  const trackedMaterialIds = new Set(existing.map((i) => i.material_id).filter(Boolean))
  const productById = new Map(products.map((p) => [p.id, p]))
  const availableVariants = variants.filter((v) => !trackedVariantIds.has(v.id))
  const availableMaterials = materials.filter((m) => !trackedMaterialIds.has(m.id))

  async function submit(event: Event) {
    event.preventDefault()
    if (!draft.refId) {
      setError('Choose what to track.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const unit = draft.itemType === 'material' ? (materials.find((m) => m.id === draft.refId)?.unit ?? 'unit') : 'unit'
      const item = await getOrCreateInventoryItem(
        db,
        shop.id,
        draft.itemType,
        draft.itemType === 'product_variant'
          ? { productVariantId: draft.refId }
          : { materialId: draft.refId },
        unit,
      )
      const qty = Math.round(Number(draft.startingQuantity) || 0)
      if (qty !== 0) {
        await recordMovement(db, shop.id, item.id, {
          movement_type: 'adjustment',
          quantity: qty,
          reason: 'Starting quantity, set when tracking began',
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start tracking this item.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title="Track an item" onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Type">
          <Segmented
            value={draft.itemType}
            options={[
              { value: 'product_variant', label: 'Finished good' },
              { value: 'material', label: 'Material' },
            ]}
            onChange={(value) => patch({ itemType: value as ItemType, refId: '' })}
            label="Item type"
          />
        </Field>

        {draft.itemType === 'product_variant' ? (
          <Field label="Variant">
            <Select value={draft.refId} onValue={(v) => set('refId', v)}>
              <option value="">Choose a variant</option>
              {availableVariants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {[productById.get(variant.product_id)?.name, variant.sku].filter(Boolean).join(' · ')}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Material">
            <Select value={draft.refId} onValue={(v) => set('refId', v)}>
              <option value="">Choose a material</option>
              {availableMaterials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Starting quantity" hint="Recorded as an adjustment movement.">
          <Input
            type="number"
            inputmode="numeric"
            value={draft.startingQuantity}
            onValue={(v) => set('startingQuantity', v)}
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Start tracking'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
