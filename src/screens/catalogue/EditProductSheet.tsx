import { useEffect, useState } from 'preact/hooks'
import { Button, ErrorNote, Field, Input, Select, Sheet, Textarea } from '../../ui'
import { useCurrentShop } from '../../state/ShopProvider'
import { ProductImageField } from '../ProductImageField'
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
  const [name, setName] = useState(product.name)
  const [productType, setProductType] = useState<ProductType>(product.product_type)
  const [categoryId, setCategoryId] = useState(product.category_id ?? '')
  const [collectionId, setCollectionId] = useState(product.collection_id ?? '')
  const [brand, setBrand] = useState(product.brand ?? '')
  const [description, setDescription] = useState(product.description ?? '')
  const [imageUrl, setImageUrl] = useState(product.image_url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(product.name)
    setProductType(product.product_type)
    setCategoryId(product.category_id ?? '')
    setCollectionId(product.collection_id ?? '')
    setBrand(product.brand ?? '')
    setDescription(product.description ?? '')
    setImageUrl(product.image_url ?? '')
  }, [product])

  async function submit(event: Event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Give the product a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateProduct(product.id, {
        name,
        product_type: productType,
        category_id: categoryId || undefined,
        collection_id: collectionId || undefined,
        brand,
        description,
        image_url: imageUrl,
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
          <Input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Type">
          <Select
            value={productType}
            onChange={(e) => setProductType((e.target as HTMLSelectElement).value as ProductType)}
          >
            {PRODUCT_TYPES.map((type) => (
              <option key={type} value={type}>
                {PRODUCT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" hint="Optional.">
          <Select value={categoryId} onChange={(e) => setCategoryId((e.target as HTMLSelectElement).value)}>
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Collection" hint="Optional.">
          <Select value={collectionId} onChange={(e) => setCollectionId((e.target as HTMLSelectElement).value)}>
            <option value="">No collection</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Brand" hint="Optional.">
          <Input value={brand} onInput={(e) => setBrand((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Description" hint="Optional.">
          <Textarea value={description} onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
        </Field>
        <ProductImageField shopId={shop.id} imageUrl={imageUrl} onChange={setImageUrl} />

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
