/* Garment identity (§29), online-only. Any tenant may track individual
   garments, gated behind the garment_identity flag. */
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
  Select,
  Sheet,
  Skeleton,
} from '../ui'
import { IconChevronRight, IconFingerprint, IconPlus } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { useOnlineFeature } from '../hooks/useOnlineFeature'
import { useFeatureFlags } from '../hooks/useFeatureFlags'
import { withTimeout } from '../lib/withTimeout'
import { listAllProductVariants, listProducts, type Product, type ProductVariant } from '../online/catalogue'
import { listProductionBatches, type ProductionBatch } from '../online/production'
import { garmentPassportUrl } from '../online/garmentPassport'
import {
  GARMENT_UNIT_STATUSES,
  createGarmentUnit,
  listGarmentUnits,
  updateGarmentUnit,
  type GarmentUnit,
  type GarmentUnitInput,
  type GarmentUnitStatus,
} from '../online/garmentUnits'
import { useBack } from '../hooks/useBack'

const STATUS_LABELS: Record<GarmentUnitStatus, string> = {
  produced: 'Produced',
  available: 'Available',
  reserved: 'Reserved',
  sold: 'Sold',
  returned: 'Returned',
  repair: 'In repair',
  retired: 'Retired',
  lost: 'Lost',
  damaged: 'Damaged',
}

export function GarmentUnits() {
  const back = useBack()
  const { db, shop } = useCurrentShop()
  const online = useOnlineFeature()
  const flags = useFeatureFlags(db, shop.id)
  const [units, setUnits] = useState<GarmentUnit[] | null>(null)
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [batches, setBatches] = useState<ProductionBatch[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<GarmentUnit | null>(null)

  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id }, sort: [{ name: 'asc' }] }).$,
    [db, shop.id],
    [],
  )
  const clients = useMemo(() => clientDocs.map((doc) => doc.toJSON()), [clientDocs])

  async function reload() {
    try {
      const [unitList, variantList, productList, batchList] = await withTimeout(
        Promise.all([
          listGarmentUnits(shop.id),
          listAllProductVariants(shop.id),
          listProducts(shop.id),
          listProductionBatches(shop.id),
        ]),
        8000,
        'No response from the server. Check your connection and try again.',
      )
      setUnits(unitList)
      setVariants(variantList)
      setProducts(productList)
      setBatches(batchList)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load garment units.')
    }
  }

  useEffect(() => {
    if (online) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, shop.id])

  const variantLabel = useMemo(() => {
    const productName = new Map(products.map((p) => [p.id, p.name]))
    return (variantId: string) => {
      const variant = variants.find((v) => v.id === variantId)
      if (!variant) return 'Unknown variant'
      const name = productName.get(variant.product_id) ?? 'Unknown product'
      return [name, [variant.size, variant.colour].filter(Boolean).join(' / '), variant.sku]
        .filter(Boolean)
        .join(' -- ')
    }
  }, [variants, products])

  const clientName = useMemo(() => {
    const byId = new Map(clients.map((c) => [c.id, c.name]))
    return (id: string | null) => (id ? (byId.get(id) ?? 'Unknown client') : null)
  }, [clients])

  if (!online) {
    return (
      <Screen title="Garment identity" back={back}>
        <EmptyState
          spacious
          illustration={<IconFingerprint size={48} />}
          title="No connection"
          description="Garment identity lives on the server, so this needs a connection to load."
        />
      </Screen>
    )
  }

  return (
    <>
      <Screen
        title="Garment identity"
        back={back}
        action={
          units && units.length > 0 && variants.length > 0 ? (
            <HeaderAction label="Add" icon={<IconPlus size={16} />} onClick={() => setAdding(true)} />
          ) : undefined
        }
      >
        <div class="space-y-4">
          {loadError && <ErrorNote>{loadError}</ErrorNote>}

          {units === null && !loadError && (
            <div class="space-y-2">
              <Skeleton class="h-14" />
              <Skeleton class="h-14" />
            </div>
          )}

          {units && variants.length === 0 && (
            <EmptyState
              spacious
              illustration={<IconFingerprint size={48} />}
              title="No variants to identify yet"
              description="Add a product with at least one variant in the catalogue first."
            />
          )}

          {units && variants.length > 0 && units.length === 0 && (
            <EmptyState
              spacious
              illustration={<IconFingerprint size={48} />}
              title="No garment units yet"
              description="Give an individual garment its own serial number and status."
              action={
                <Button onClick={() => setAdding(true)}>
                  <IconPlus size={18} /> Add a garment unit
                </Button>
              }
            />
          )}

          {units && units.length > 0 && (
            <Card padded={false}>
              <RowList>
                {units.map((unit) => (
                  <li key={unit.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(unit)}
                      class="flex min-h-tap w-full items-center gap-3 px-gutter py-3 text-left
                             transition-colors hover:bg-hover active:bg-pressed"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium">{unit.serial_number}</span>
                        <span class="block truncate text-sm text-content-muted">
                          {[STATUS_LABELS[unit.status], variantLabel(unit.product_variant_id), clientName(unit.customer_id)]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <IconChevronRight size={18} class="shrink-0 text-content-subtle" />
                    </button>
                  </li>
                ))}
              </RowList>
            </Card>
          )}
        </div>
      </Screen>

      <GarmentUnitSheet
        open={adding}
        variants={variants}
        batches={batches}
        clients={clients}
        variantLabel={variantLabel}
        onClose={() => setAdding(false)}
        onSaved={reload}
      />
      {editing && (
        <GarmentUnitSheet
          open={Boolean(editing)}
          unit={editing}
          variants={variants}
          batches={batches}
          clients={clients}
          variantLabel={variantLabel}
          passportEnabled={flags.garment_passport}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </>
  )
}

function GarmentUnitSheet({
  open,
  unit,
  variants,
  batches,
  clients,
  variantLabel,
  passportEnabled,
  onClose,
  onSaved,
}: {
  open: boolean
  unit?: GarmentUnit
  variants: ProductVariant[]
  batches: ProductionBatch[]
  clients: { id: string; name: string }[]
  variantLabel: (variantId: string) => string
  passportEnabled?: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { shop } = useCurrentShop()
  const [copied, setCopied] = useState(false)
  const [variantId, setVariantId] = useState(unit?.product_variant_id ?? variants[0]?.id ?? '')
  const [batchId, setBatchId] = useState(unit?.production_batch_id ?? '')
  const [serialNumber, setSerialNumber] = useState(unit?.serial_number ?? '')
  const [status, setStatus] = useState<GarmentUnitStatus>(unit?.status ?? 'produced')
  const [customerId, setCustomerId] = useState(unit?.customer_id ?? '')
  const [soldAt, setSoldAt] = useState(unit?.sold_at?.slice(0, 10) ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    if (!variantId) {
      setError('Choose which variant this garment is.')
      return
    }
    if (!serialNumber.trim()) {
      setError('Give this garment a serial number.')
      return
    }
    setSaving(true)
    setError(null)
    const input: GarmentUnitInput = {
      product_variant_id: variantId,
      production_batch_id: batchId || undefined,
      serial_number: serialNumber,
      status,
      customer_id: customerId || undefined,
      sold_at: status === 'sold' ? soldAt || undefined : undefined,
    }
    try {
      if (unit) {
        await updateGarmentUnit(unit.id, input)
      } else {
        await createGarmentUnit(shop.id, input)
      }
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this garment unit.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title={unit ? 'Edit garment unit' : 'New garment unit'} onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        {unit && passportEnabled && (
          <div class="flex items-center justify-between gap-2 rounded-control bg-surface-sunken px-3 py-2.5">
            <span class="truncate font-mono text-xs text-content-muted">
              {garmentPassportUrl(unit.public_token)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(garmentPassportUrl(unit.public_token))
                setCopied(true)
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        )}

        <Field label="Variant">
          <Select value={variantId} onValue={setVariantId}>
            <option value="">Choose a variant</option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variantLabel(variant.id)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Serial number" hint='e.g. "F002-B01-017".'>
          <Input value={serialNumber} onValue={setSerialNumber} />
        </Field>

        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value as GarmentUnitStatus)}>
            {GARMENT_UNIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Production batch" hint="Optional -- which batch this unit came from.">
          <Select value={batchId} onValue={setBatchId}>
            <option value="">No batch</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.batch_number}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Customer" hint="Optional -- who this garment belongs to.">
          <Select value={customerId} onValue={setCustomerId}>
            <option value="">No customer</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        </Field>

        {status === 'sold' && (
          <Field label="Sold on" hint="Optional.">
            <Input type="date" value={soldAt} onValue={setSoldAt} />
          </Field>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save garment unit'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
