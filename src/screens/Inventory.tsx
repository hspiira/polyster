/**
 * Inventory: finished goods and materials, tracked as a ledger (see
 * src/online/inventory.ts). Online-only, see Catalogue.tsx for the pattern.
 */
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
  Segmented,
  Select,
  Sheet,
  Skeleton,
} from '../components/ui'
import { IconChevronRight, IconPlus, IconReceipt } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useOnlineFeature } from '../hooks/useOnlineFeature'
import { withTimeout } from '../lib/withTimeout'
import {
  getOrCreateInventoryItem,
  listInventoryItems,
  recordMovement,
  type InventoryItem,
  type ItemType,
} from '../online/inventory'
import { listAllProductVariants, listProducts, type Product, type ProductVariant } from '../online/catalogue'
import { listMaterials, type Material } from '../online/materials'
import { useBack } from '../hooks/useBack'

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'product_variant', label: 'Finished goods' },
  { value: 'material', label: 'Materials' },
] as const

export function Inventory() {
  const back = useBack()
  const { shop } = useCurrentShop()
  const online = useOnlineFeature()
  const [items, setItems] = useState<InventoryItem[] | null>(null)
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [scope, setScope] = useState<'all' | ItemType>('all')
  const [tracking, setTracking] = useState(false)

  async function reload() {
    try {
      const [itemList, variantList, productList, materialList] = await withTimeout(
        Promise.all([
          listInventoryItems(shop.id),
          listAllProductVariants(shop.id),
          listProducts(shop.id),
          listMaterials(shop.id),
        ]),
        8000,
        'No response from the server. Check your connection and try again.',
      )
      setItems(itemList)
      setVariants(variantList)
      setProducts(productList)
      setMaterials(materialList)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load inventory.')
    }
  }

  useEffect(() => {
    if (online) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, shop.id])

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

  const filtered = useMemo(() => {
    if (!items) return []
    return scope === 'all' ? items : items.filter((item) => item.item_type === scope)
  }, [items, scope])

  if (!online) {
    return (
      <Screen title="Inventory" back={back}>
        <EmptyState
          spacious
          illustration={<IconReceipt size={48} />}
          title="No connection"
          description="Inventory lives on the server, so this needs a connection to load."
        />
      </Screen>
    )
  }

  return (
    <>
      <Screen
        title="Inventory"
        back={back}
        action={<HeaderAction label="Track item" icon={<IconPlus size={16} />} onClick={() => setTracking(true)} />}
      >
        <div class="space-y-4">
          {loadError && <ErrorNote>{loadError}</ErrorNote>}

          {items === null && !loadError && (
            <div class="space-y-2">
              <Skeleton class="h-14" />
              <Skeleton class="h-14" />
            </div>
          )}

          {items && items.length > 0 && (
            <Segmented value={scope} options={SCOPE_OPTIONS} onChange={setScope} label="Scope" />
          )}

          {items && items.length === 0 && (
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
        existing={items ?? []}
        onClose={() => setTracking(false)}
        onSaved={reload}
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
  onSaved,
}: {
  open: boolean
  variants: ProductVariant[]
  products: Product[]
  materials: Material[]
  existing: InventoryItem[]
  onClose: () => void
  onSaved: () => void
}) {
  const { shop } = useCurrentShop()
  const [itemType, setItemType] = useState<ItemType>('product_variant')
  const [refId, setRefId] = useState('')
  const [startingQuantity, setStartingQuantity] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const trackedVariantIds = new Set(existing.map((i) => i.product_variant_id).filter(Boolean))
  const trackedMaterialIds = new Set(existing.map((i) => i.material_id).filter(Boolean))
  const productById = new Map(products.map((p) => [p.id, p]))
  const availableVariants = variants.filter((v) => !trackedVariantIds.has(v.id))
  const availableMaterials = materials.filter((m) => !trackedMaterialIds.has(m.id))

  async function submit(event: Event) {
    event.preventDefault()
    if (!refId) {
      setError('Choose what to track.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const unit = itemType === 'material' ? (materials.find((m) => m.id === refId)?.unit ?? 'unit') : 'unit'
      const item = await getOrCreateInventoryItem(
        shop.id,
        itemType,
        itemType === 'product_variant' ? { productVariantId: refId } : { materialId: refId },
        unit,
      )
      const qty = Math.round(Number(startingQuantity) || 0)
      if (qty !== 0) {
        await recordMovement(shop.id, item.id, {
          movement_type: 'adjustment',
          quantity: qty,
          reason: 'Starting quantity, set when tracking began',
        })
      }
      onClose()
      onSaved()
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
            value={itemType}
            options={[
              { value: 'product_variant', label: 'Finished good' },
              { value: 'material', label: 'Material' },
            ]}
            onChange={(value) => {
              setItemType(value as ItemType)
              setRefId('')
            }}
            label="Item type"
          />
        </Field>

        {itemType === 'product_variant' ? (
          <Field label="Variant">
            <Select value={refId} onChange={(e) => setRefId((e.target as HTMLSelectElement).value)}>
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
            <Select value={refId} onChange={(e) => setRefId((e.target as HTMLSelectElement).value)}>
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
            value={startingQuantity}
            onInput={(e) => setStartingQuantity((e.target as HTMLInputElement).value)}
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
