import { useEffect, useState } from 'preact/hooks'
import { Button, ErrorNote, Field, Input, Select, Sheet, Textarea } from '../../ui'
import { useCurrentShop } from '../../state/ShopProvider'
import { ProductImageField } from '../ProductImageField'
import { useDraft } from '../../hooks/useDraft'
import {
  PRODUCT_TYPES,
  updateProduct,
  type Product,
  type ProductCategory,
  type ProductType,
} from '../../online/catalogue'
import { type Collection } from '../../online/collections'

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  garment: 'Garment',
  accessory: 'Accessory',
  service: 'Service',
  rental: 'Rental',
  custom: 'Custom',
}

interface ProductDraft {
  name: string
  productType: ProductType
  categoryId: string
  collectionId: string
  brand: string
  description: string
  imageUrl: string
}

export function EditProductSheet({
  open,
  product,
  categories,
  collections,
  onClose,
  onSaved,
}: {
  open: boolean
  product: Product
  categories: ProductCategory[]
  collections: Collection[]
  onClose: () => void
  onSaved: () => void
}) {
  const { shop } = useCurrentShop()
  const from = (source: Product): ProductDraft => ({
    name: source.name,
    productType: source.product_type,
    categoryId: source.category_id ?? '',
    collectionId: source.collection_id ?? '',
    brand: source.brand ?? '',
    description: source.description ?? '',
    imageUrl: source.image_url ?? '',
  })
  const { draft, set, reset } = useDraft<ProductDraft>(() => from(product))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    reset(from(product))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product])

  async function submit(event: Event) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('Give the product a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateProduct(product.id, {
        name: draft.name,
        product_type: draft.productType,
        category_id: draft.categoryId || undefined,
        collection_id: draft.collectionId || undefined,
        brand: draft.brand,
        description: draft.description,
        image_url: draft.imageUrl,
      })
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this product.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title="Edit product" onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Name">
          <Input value={draft.name} onValue={(v) => set('name', v)} />
        </Field>
        <Field label="Type">
          <Select
            value={draft.productType}
            onValue={(v) => set('productType', v as ProductType)}
          >
            {PRODUCT_TYPES.map((type) => (
              <option key={type} value={type}>
                {PRODUCT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" hint="Optional.">
          <Select value={draft.categoryId} onValue={(v) => set('categoryId', v)}>
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Collection" hint="Optional.">
          <Select value={draft.collectionId} onValue={(v) => set('collectionId', v)}>
            <option value="">No collection</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Brand" hint="Optional.">
          <Input value={draft.brand} onValue={(v) => set('brand', v)} />
        </Field>
        <Field label="Description" hint="Optional.">
          <Textarea value={draft.description} onValue={(v) => set('description', v)} />
        </Field>
        <ProductImageField shopId={shop.id} imageUrl={draft.imageUrl} onChange={(v) => set('imageUrl', v)} />

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
