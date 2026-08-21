/* Products, search, add. Online-only: no local cache, so this screen needs a
   connection to load or change anything. */
import { useMemo, useState } from 'preact/hooks'
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
  Textarea,
} from '../ui'
import { IconPlus, IconTag } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useQuery } from '../hooks/useQuery'
import { ProductImageField } from './ProductImageField'
import {
  createProduct,
  createProductCategory,
  deleteProductCategory,
  observeCollections,
  observeProductCategories,
  observeProducts,
  renameProductCategory,
} from '../db/repo'
import {
  PRODUCT_TYPES,
  type Collection,
  type ProductCategory,
  type ProductType,
} from '../db/schema'
import { useBack } from '../hooks/useBack'
import { useDraft } from '../hooks/useDraft'
import { filterByQuery } from '../lib/search'

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

export function Catalogue() {
  const back = useBack()
  const { db, shop } = useCurrentShop()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [managingCategories, setManagingCategories] = useState(false)

  const products = useQuery(() => observeProducts(db, shop.id), [db, shop.id], [])
  const categories = useQuery(() => observeProductCategories(db, shop.id), [db, shop.id], [])
  const collections = useQuery(() => observeCollections(db, shop.id), [db, shop.id], [])

  const categoryName = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c.name]))
    return (id: string | null) => (id ? (byId.get(id) ?? null) : null)
  }, [categories])

  const matches = useMemo(
    () => filterByQuery(products, search, (product) => ({ text: [product.name, product.brand] })),
    [products, search],
  )

  return (
    <>
      <Screen
        title="Catalogue"
        back={back}
        action={
          products.length > 0 ? (
            <HeaderAction label="Add" icon={<IconPlus size={16} />} onClick={() => setAdding(true)} />
          ) : undefined
        }
      >
        <div class="space-y-4">
          {products.length > 0 && (
            <SearchInput
              placeholder="Search by name or brand"
              value={search}
              onValue={setSearch}
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
      />
      <CategorySheet
        open={managingCategories}
        categories={categories}
        onClose={() => setManagingCategories(false)}
      />
    </>
  )
}

function AddProductSheet({
  open,
  categories,
  collections,
  onClose,
}: {
  open: boolean
  categories: ProductCategory[]
  collections: Collection[]
  onClose: () => void
}) {
  const { db, shop } = useCurrentShop()
  const blank = (): ProductDraft => ({
    name: '',
    productType: 'garment',
    categoryId: '',
    collectionId: '',
    brand: '',
    description: '',
    imageUrl: '',
  })
  const { draft, set, reset: resetDraft } = useDraft<ProductDraft>(blank)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    resetDraft(blank())
    setError(null)
  }

  async function submit(event: Event) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('Give the product a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createProduct(db, shop.id, {
        name: draft.name,
        product_type: draft.productType,
        category_id: draft.categoryId || undefined,
        collection_id: draft.collectionId || undefined,
        brand: draft.brand,
        description: draft.description,
        image_url: draft.imageUrl,
      })
      reset()
      onClose()
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
          <Input value={draft.name} autofocus onValue={(v) => set('name', v)} />
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
}: {
  open: boolean
  categories: ProductCategory[]
  onClose: () => void
}) {
  const { db, shop } = useCurrentShop()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function add(event: Event) {
    event.preventDefault()
    if (!name.trim()) return
    setAdding(true)
    setError(null)
    try {
      await createProductCategory(db, shop.id, name)
      setName('')
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
      await renameProductCategory(db, category.id, next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename that category.')
    }
  }

  async function remove(category: ProductCategory) {
    try {
      await deleteProductCategory(db, category.id)
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
              onValue={setName}
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
