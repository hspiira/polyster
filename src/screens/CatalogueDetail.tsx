/**
 * One product: its details and its variants. Online-only, see Catalogue.tsx.
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
  Segmented,
  Select,
  Sheet,
  Skeleton,
  Textarea,
} from '../components/ui'
import { IconEdit, IconPlus } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useOnlineFeature } from '../hooks/useOnlineFeature'
import { withTimeout } from '../lib/withTimeout'
import { ProductImageField } from './ProductImageField'
import { formatMinor } from '../lib/money'
import {
  PRODUCT_TYPES,
  createProductVariant,
  getProduct,
  listProductCategories,
  listProductVariants,
  updateProduct,
  updateProductVariant,
  setProductVariantActive,
  type Product,
  type ProductCategory,
  type ProductType,
  type ProductVariant,
} from '../online/catalogue'

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  garment: 'Garment',
  accessory: 'Accessory',
  service: 'Service',
  rental: 'Rental',
  custom: 'Custom',
}

const TOGGLE_OPTIONS = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
] as const

export function CatalogueDetail() {
  const { params } = useRoute()
  const productId = params.id ?? ''
  const { shop } = useCurrentShop()
  const online = useOnlineFeature()

  const [product, setProduct] = useState<Product | null | undefined>(undefined)
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [addingVariant, setAddingVariant] = useState(false)

  async function reload() {
    try {
      const [found, categoryList, variantList] = await withTimeout(
        Promise.all([getProduct(productId), listProductCategories(shop.id), listProductVariants(productId)]),
        8000,
        'No response from the server. Check your connection and try again.',
      )
      setProduct(found)
      setCategories(categoryList)
      setVariants(variantList)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load this product.')
    }
  }

  useEffect(() => {
    if (online) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, productId])

  if (!online) {
    return (
      <Screen title="Product" back="/catalogue">
        <EmptyState
          spacious
          title="No connection"
          description="The catalogue lives on the server, so this needs a connection."
        />
      </Screen>
    )
  }

  if (loadError) {
    return (
      <Screen title="Product" back="/catalogue">
        <ErrorNote>{loadError}</ErrorNote>
      </Screen>
    )
  }

  if (product === undefined) {
    return (
      <Screen title="Product" back="/catalogue">
        <Skeleton class="h-32" />
      </Screen>
    )
  }

  if (product === null) {
    return (
      <Screen title="Product" back="/catalogue">
        <EmptyState
          spacious
          title="Product not found"
          description="It may have been removed."
          action={
            <Button linkTo="/catalogue" variant="secondary">
              Back to catalogue
            </Button>
          }
        />
      </Screen>
    )
  }

  const categoryName = categories.find((c) => c.id === product.category_id)?.name

  return (
    <>
      <Screen
        title={product.name}
        back="/catalogue"
        action={
          <Button variant="ghost" size="sm" aria-label="Edit product" onClick={() => setEditing(true)}>
            <IconEdit size={20} />
          </Button>
        }
      >
        <div class="space-y-5">
          <Card>
            {product.image_url && (
              <img
                src={product.image_url}
                alt=""
                class="mb-3 h-40 w-full rounded-control object-cover"
              />
            )}
            <div class="space-y-2 text-sm">
              <Row label="Type" value={PRODUCT_TYPE_LABELS[product.product_type]} />
              {categoryName && <Row label="Category" value={categoryName} />}
              {product.brand && <Row label="Brand" value={product.brand} />}
              {product.description && <Row label="Description" value={product.description} />}
              <Row label="Status" value={product.active ? 'Active' : 'Inactive'} />
            </div>
          </Card>

          <section>
            <SectionTitle
              action={
                <Button size="sm" onClick={() => setAddingVariant(true)}>
                  <IconPlus size={16} /> Add
                </Button>
              }
            >
              Variants
            </SectionTitle>

            {variants.length === 0 ? (
              <Card>
                <p class="text-sm text-content-muted">
                  No variants yet. Add a SKU, size or colour, and a price to start selling this
                  product.
                </p>
              </Card>
            ) : (
              <Card padded={false}>
                <RowList>
                  {variants.map((variant) => (
                    <VariantRow key={variant.id} variant={variant} onChanged={reload} />
                  ))}
                </RowList>
              </Card>
            )}
          </section>
        </div>
      </Screen>

      <EditProductSheet
        open={editing}
        product={product}
        categories={categories}
        onClose={() => setEditing(false)}
        onSaved={reload}
      />
      <AddVariantSheet
        open={addingVariant}
        productId={product.id}
        onClose={() => setAddingVariant(false)}
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

function VariantRow({ variant, onChanged }: { variant: ProductVariant; onChanged: () => void }) {
  const { shop } = useCurrentShop()
  const [editing, setEditing] = useState(false)
  const [toggling, setToggling] = useState(false)

  async function toggleActive(value: string) {
    setToggling(true)
    try {
      await setProductVariantActive(variant.id, value === 'on')
      onChanged()
    } finally {
      setToggling(false)
    }
  }

  return (
    <li class="flex items-center gap-3 px-3 py-2.5">
      <button
        type="button"
        class="min-w-0 flex-1 text-left"
        onClick={() => setEditing(true)}
      >
        <span class="block truncate font-medium">{variant.sku}</span>
        <span class="block truncate text-sm text-content-muted">
          {[variant.size, variant.colour, formatMinor(variant.price_minor, shop.currency)]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </button>
      <Segmented
        value={variant.active ? 'on' : 'off'}
        options={TOGGLE_OPTIONS}
        onChange={(value) => void toggleActive(value)}
        label={`${variant.sku} active`}
      />
      <EditVariantSheet
        open={editing}
        variant={variant}
        onClose={() => setEditing(false)}
        onSaved={onChanged}
      />
      {toggling && <span class="sr-only">Saving</span>}
    </li>
  )
}

function EditProductSheet({
  open,
  product,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean
  product: Product
  categories: ProductCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const { shop } = useCurrentShop()
  const [name, setName] = useState(product.name)
  const [productType, setProductType] = useState<ProductType>(product.product_type)
  const [categoryId, setCategoryId] = useState(product.category_id ?? '')
  const [brand, setBrand] = useState(product.brand ?? '')
  const [description, setDescription] = useState(product.description ?? '')
  const [imageUrl, setImageUrl] = useState(product.image_url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(product.name)
    setProductType(product.product_type)
    setCategoryId(product.category_id ?? '')
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

function VariantFields({
  sku,
  setSku,
  size,
  setSize,
  colour,
  setColour,
  price,
  setPrice,
  cost,
  setCost,
}: {
  sku: string
  setSku: (v: string) => void
  size: string
  setSize: (v: string) => void
  colour: string
  setColour: (v: string) => void
  price: string
  setPrice: (v: string) => void
  cost: string
  setCost: (v: string) => void
}) {
  return (
    <>
      <Field label="SKU">
        <Input value={sku} autofocus onInput={(e) => setSku((e.target as HTMLInputElement).value)} />
      </Field>
      <div class="flex gap-3">
        <div class="flex-1">
          <Field label="Size" hint="Optional.">
            <Input value={size} onInput={(e) => setSize((e.target as HTMLInputElement).value)} />
          </Field>
        </div>
        <div class="flex-1">
          <Field label="Colour" hint="Optional.">
            <Input value={colour} onInput={(e) => setColour((e.target as HTMLInputElement).value)} />
          </Field>
        </div>
      </div>
      <div class="flex gap-3">
        <div class="flex-1">
          <Field label="Price (minor units)">
            <Input
              type="number"
              inputmode="numeric"
              value={price}
              onInput={(e) => setPrice((e.target as HTMLInputElement).value)}
            />
          </Field>
        </div>
        <div class="flex-1">
          <Field label="Cost (minor units)" hint="Optional.">
            <Input
              type="number"
              inputmode="numeric"
              value={cost}
              onInput={(e) => setCost((e.target as HTMLInputElement).value)}
            />
          </Field>
        </div>
      </div>
    </>
  )
}

function AddVariantSheet({
  open,
  productId,
  onClose,
  onSaved,
}: {
  open: boolean
  productId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { shop } = useCurrentShop()
  const [sku, setSku] = useState('')
  const [size, setSize] = useState('')
  const [colour, setColour] = useState('')
  const [price, setPrice] = useState('0')
  const [cost, setCost] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setSku('')
    setSize('')
    setColour('')
    setPrice('0')
    setCost('0')
    setError(null)
  }

  async function submit(event: Event) {
    event.preventDefault()
    if (!sku.trim()) {
      setError('Give the variant a SKU.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createProductVariant(shop.id, productId, {
        sku,
        size,
        colour,
        price_minor: Math.max(0, Math.round(Number(price) || 0)),
        cost_minor: Math.max(0, Math.round(Number(cost) || 0)),
      })
      reset()
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this variant.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title="New variant" onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <VariantFields
          sku={sku}
          setSku={setSku}
          size={size}
          setSize={setSize}
          colour={colour}
          setColour={setColour}
          price={price}
          setPrice={setPrice}
          cost={cost}
          setCost={setCost}
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save variant'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function EditVariantSheet({
  open,
  variant,
  onClose,
  onSaved,
}: {
  open: boolean
  variant: ProductVariant
  onClose: () => void
  onSaved: () => void
}) {
  const [sku, setSku] = useState(variant.sku)
  const [size, setSize] = useState(variant.size ?? '')
  const [colour, setColour] = useState(variant.colour ?? '')
  const [price, setPrice] = useState(String(variant.price_minor))
  const [cost, setCost] = useState(String(variant.cost_minor))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSku(variant.sku)
    setSize(variant.size ?? '')
    setColour(variant.colour ?? '')
    setPrice(String(variant.price_minor))
    setCost(String(variant.cost_minor))
  }, [variant])

  async function submit(event: Event) {
    event.preventDefault()
    if (!sku.trim()) {
      setError('Give the variant a SKU.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateProductVariant(variant.id, {
        sku,
        size,
        colour,
        price_minor: Math.max(0, Math.round(Number(price) || 0)),
        cost_minor: Math.max(0, Math.round(Number(cost) || 0)),
      })
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this variant.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title="Edit variant" onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <VariantFields
          sku={sku}
          setSku={setSku}
          size={size}
          setSize={setSize}
          colour={colour}
          setColour={setColour}
          price={price}
          setPrice={setPrice}
          cost={cost}
          setCost={setCost}
        />
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
