/* One product: its details and its variants. */
import { useState } from 'preact/hooks'
import { useRoute } from 'preact-iso'
import {
  Button,
  Card,
  EmptyState,
  RowList,
  Screen,
  SectionTitle,
  Skeleton,
} from '../ui'
import { IconEdit, IconPlus } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useQuery, useQueryStatus } from '../hooks/useQuery'
import {
  observeCollections,
  observeProduct,
  observeProductCategories,
  observeProductVariants,
} from '../db/repo'
import type { ProductType } from '../db/schema'
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
  const { db, shop } = useCurrentShop()
  const [editing, setEditing] = useState(false)
  const [addingVariant, setAddingVariant] = useState(false)

  const found = useQueryStatus(() => observeProduct(db, productId), [db, productId], null)
  const product = found.value
  const categories = useQuery(() => observeProductCategories(db, shop.id), [db, shop.id], [])
  const collections = useQuery(() => observeCollections(db, shop.id), [db, shop.id], [])
  const variants = useQuery(() => observeProductVariants(db, productId), [db, productId], [])

  if (!found.loaded) {
    return (
      <Screen title="Product" back={back}>
        <Skeleton class="h-32" />
      </Screen>
    )
  }

  if (!product) {
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
                    <VariantRow key={variant.id} variant={variant} />
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
      />
      <VariantSheet
        open={addingVariant}
        productId={product.id}
        onClose={() => setAddingVariant(false)}
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

