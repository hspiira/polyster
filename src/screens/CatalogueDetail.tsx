/* One product: its details and its variants. Online-only, see Catalogue.tsx. */
import { useEffect, useState } from 'preact/hooks'
import { useRoute } from 'preact-iso'
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  RowList,
  Screen,
  SectionTitle,
  Skeleton,
} from '../components/ui'
import { IconEdit, IconPlus } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useOnlineFeature } from '../hooks/useOnlineFeature'
import { withTimeout } from '../lib/withTimeout'
import {
  getProduct,
  listProductCategories,
  listProductVariants,
  type Product,
  type ProductCategory,
  type ProductType,
  type ProductVariant,
} from '../online/catalogue'
import { listCollections, type Collection } from '../online/collections'
import { useBack } from '../hooks/useBack'
import { EditProductSheet } from './catalogue/EditProductSheet'
import { VariantRow } from './catalogue/VariantRow'
import { VariantSheet } from './catalogue/VariantSheet'

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  garment: 'Garment',
  accessory: 'Accessory',
  service: 'Service',
  rental: 'Rental',
  custom: 'Custom',
}

export function CatalogueDetail() {
  const back = useBack()
  const { params } = useRoute()
  const productId = params.id ?? ''
  const { shop } = useCurrentShop()
  const online = useOnlineFeature()

  const [product, setProduct] = useState<Product | null | undefined>(undefined)
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [addingVariant, setAddingVariant] = useState(false)

  async function reload() {
    try {
      const [found, categoryList, collectionList, variantList] = await withTimeout(
        Promise.all([
          getProduct(productId),
          listProductCategories(shop.id),
          listCollections(shop.id),
          listProductVariants(productId),
        ]),
        8000,
        'No response from the server. Check your connection and try again.',
      )
      setProduct(found)
      setCategories(categoryList)
      setCollections(collectionList)
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
      <Screen title="Product" back={back}>
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
      <Screen title="Product" back={back}>
        <ErrorNote>{loadError}</ErrorNote>
      </Screen>
    )
  }

  if (product === undefined) {
    return (
      <Screen title="Product" back={back}>
        <Skeleton class="h-32" />
      </Screen>
    )
  }

  if (product === null) {
    return (
      <Screen title="Product" back={back}>
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
  const collectionName = collections.find((c) => c.id === product.collection_id)?.name

  return (
    <>
      <Screen
        title={product.name}
        back={back}
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
              {collectionName && <Row label="Collection" value={collectionName} />}
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
        collections={collections}
        onClose={() => setEditing(false)}
        onSaved={reload}
      />
      <VariantSheet
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

