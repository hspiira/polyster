/**
 * Catalogue: products, search, add. Online-only (see src/online/catalogue.ts)
 * -- there is no local cache, so this screen needs a connection to load or
 * change anything.
 */
import { useEffect, useMemo, useState } from 'preact/hooks'
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  HeaderAction,
  InfoNote,
  Input,
  ListRow,
  RowList,
  Screen,
  SearchInput,
  Select,
  Sheet,
  Skeleton,
  Textarea,
} from '../components/ui'
import { IconPlus, IconTag } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useOnlineFeature } from '../hooks/useOnlineFeature'
import { withTimeout } from '../lib/withTimeout'
import { ProductImageField } from './ProductImageField'
import {
  PRODUCT_TYPES,
  createProduct,
  createProductCategory,
  deleteProductCategory,
  listProductCategories,
  listProducts,
  renameProductCategory,
  type Product,
  type ProductCategory,
  type ProductType,
} from '../online/catalogue'
import { listCollections, type Collection } from '../online/collections'
import { useBack } from '../hooks/useBack'

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  garment: 'Garment',
  accessory: 'Accessory',
  service: 'Service',
  rental: 'Rental',
  custom: 'Custom',
}

export function Catalogue() {
  const back = useBack()
  const { shop } = useCurrentShop()
  const online = useOnlineFeature()
  const [products, setProducts] = useState<Product[] | null>(null)
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [managingCategories, setManagingCategories] = useState(false)

  async function reload() {
    try {
      const [productList, categoryList, collectionList] = await withTimeout(
        Promise.all([listProducts(shop.id), listProductCategories(shop.id), listCollections(shop.id)]),
        8000,
        'No response from the server. Check your connection and try again.',
      )
      setProducts(productList)
      setCategories(categoryList)
      setCollections(collectionList)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the catalogue.')
    }
  }

  useEffect(() => {
    if (online) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, shop.id])

  const categoryName = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c.name]))
    return (id: string | null) => (id ? (byId.get(id) ?? null) : null)
  }, [categories])

  const matches = useMemo(() => {
    if (!products) return []
    const term = search.trim().toLowerCase()
    if (!term) return products
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        (product.brand ?? '').toLowerCase().includes(term),
    )
  }, [products, search])

  if (!online) {
    return (
      <Screen title="Catalogue" back={back}>
        <EmptyState
          spacious
          illustration={<IconTag size={48} />}
          title="No connection"
          description="The catalogue lives on the server, not on this device, so it needs a connection to load."
        />
      </Screen>
    )
  }

  return (
    <>
      <Screen
        title="Catalogue"
        back={back}
        action={
          products && products.length > 0 ? (
            <HeaderAction label="Add" icon={<IconPlus size={16} />} onClick={() => setAdding(true)} />
          ) : undefined
        }
      >
        <div class="space-y-4">
          {loadError && <ErrorNote>{loadError}</ErrorNote>}

          {products === null && !loadError && (
            <div class="space-y-2">
              <Skeleton class="h-14" />
              <Skeleton class="h-14" />
              <Skeleton class="h-14" />
            </div>
          )}

          {products && products.length > 0 && (
            <SearchInput
              placeholder="Search by name or brand"
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            />
          )}

          {products && products.length === 0 && (
            <EmptyState
              spacious
              illustration={<IconTag size={48} />}
              title="No products yet"
              description="Add your first product, then give it variants -- sizes, colours, SKUs -- from its detail page."
              action={
                <Button onClick={() => setAdding(true)}>
                  <IconPlus size={18} /> Add a product
                </Button>
              }
            />
          )}

          {products && products.length > 0 && matches.length === 0 && (
            <EmptyState
              title="No matches"
              description={`Nothing found for "${search.trim()}".`}
            />
          )}

          {matches.length > 0 && (
            <Card padded={false}>
              <RowList>
                {matches.map((product) => (
                  <li key={product.id}>
                    <ListRow href={`/catalogue/${product.id}`}>
                      <span class="block truncate font-medium">
                        {product.name}
                        {!product.active && (
                          <span class="ml-2 text-xs font-normal text-content-subtle">Inactive</span>
                        )}
                      </span>
                      <span class="block truncate text-sm text-content-muted">
                        {[categoryName(product.category_id), PRODUCT_TYPE_LABELS[product.product_type]]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </ListRow>
                  </li>
                ))}
              </RowList>
            </Card>
          )}

          {products && products.length > 0 && (
            <button
              type="button"
              class="text-sm font-medium text-accent"
              onClick={() => setManagingCategories(true)}
            >
              Manage categories
            </button>
          )}
        </div>
      </Screen>

      <AddProductSheet
        open={adding}
        categories={categories}
        collections={collections}
        onClose={() => setAdding(false)}
        onSaved={reload}
      />
      <CategorySheet
        open={managingCategories}
        categories={categories}
        onClose={() => setManagingCategories(false)}
        onChanged={reload}
      />
    </>
  )
}

function AddProductSheet({
  open,
  categories,
  collections,
  onClose,
  onSaved,
}: {
  open: boolean
  categories: ProductCategory[]
  collections: Collection[]
  onClose: () => void
  onSaved: () => void
}) {
  const { shop } = useCurrentShop()
  const [name, setName] = useState('')
  const [productType, setProductType] = useState<ProductType>('garment')
  const [categoryId, setCategoryId] = useState('')
  const [collectionId, setCollectionId] = useState('')
  const [brand, setBrand] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setName('')
    setProductType('garment')
    setCategoryId('')
    setCollectionId('')
    setBrand('')
    setDescription('')
    setImageUrl('')
    setError(null)
  }

  async function submit(event: Event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Give the product a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createProduct(shop.id, {
        name,
        product_type: productType,
        category_id: categoryId || undefined,
        collection_id: collectionId || undefined,
        brand,
        description,
        image_url: imageUrl,
      })
      reset()
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this product.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title="New product" onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Name">
          <Input value={name} autofocus onInput={(e) => setName((e.target as HTMLInputElement).value)} />
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
            {saving ? 'Saving...' : 'Save product'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function CategorySheet({
  open,
  categories,
  onClose,
  onChanged,
}: {
  open: boolean
  categories: ProductCategory[]
  onClose: () => void
  onChanged: () => void
}) {
  const { shop } = useCurrentShop()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function add(event: Event) {
    event.preventDefault()
    if (!name.trim()) return
    setAdding(true)
    setError(null)
    try {
      await createProductCategory(shop.id, name)
      setName('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that category.')
    } finally {
      setAdding(false)
    }
  }

  async function rename(category: ProductCategory) {
    const next = prompt('Rename category', category.name)
    if (!next || !next.trim() || next.trim() === category.name) return
    try {
      await renameProductCategory(category.id, next)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename that category.')
    }
  }

  async function remove(category: ProductCategory) {
    try {
      await deleteProductCategory(category.id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that category.')
    }
  }

  return (
    <Sheet open={open} title="Categories" onClose={onClose}>
      <div class="space-y-4">
        <form onSubmit={add} class="flex gap-2">
          <div class="flex-1">
            <Input
              value={name}
              placeholder="New category"
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </div>
          <Button type="submit" disabled={adding}>
            Add
          </Button>
        </form>

        {error && <ErrorNote>{error}</ErrorNote>}

        {categories.length > 0 && (
          <Card padded={false}>
            <ul>
              {categories.map((category) => (
                <li key={category.id} class="flex items-center gap-1 px-3 py-2.5">
                  <span class="min-w-0 flex-1 truncate pl-1">{category.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => void rename(category)}>
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-danger"
                    onClick={() => void remove(category)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <InfoNote>
          Removing a category does not remove its products -- they just become uncategorised.
        </InfoNote>
      </div>
    </Sheet>
  )
}
