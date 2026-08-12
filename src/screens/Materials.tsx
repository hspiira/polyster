/**
 * Materials. Online-only (see src/online/materials.ts).
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
  SearchInput,
  Segmented,
  Select,
  Sheet,
  Skeleton,
} from '../components/ui'
import { IconChevronRight, IconPlus, IconTag } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useOnlineFeature } from '../hooks/useOnlineFeature'
import { withTimeout } from '../lib/withTimeout'
import {
  MATERIAL_TYPES,
  createMaterial,
  listMaterials,
  setMaterialActive,
  updateMaterial,
  type Material,
  type MaterialInput,
  type MaterialType,
} from '../online/materials'
import { listSuppliers, type Supplier } from '../online/suppliers'
import { findInventoryItem, listInventoryItems } from '../online/inventory'

const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  fabric: 'Fabric',
  thread: 'Thread',
  button: 'Button',
  zipper: 'Zipper',
  label: 'Label',
  packaging: 'Packaging',
  other: 'Other',
}

const TOGGLE_OPTIONS = [
  { value: 'on', label: 'Active' },
  { value: 'off', label: 'Inactive' },
] as const

export function Materials() {
  const { shop } = useCurrentShop()
  const online = useOnlineFeature()
  const [materials, setMaterials] = useState<Material[] | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)

  async function reload() {
    try {
      const [materialList, supplierList, items] = await withTimeout(
        Promise.all([listMaterials(shop.id), listSuppliers(shop.id), listInventoryItems(shop.id)]),
        8000,
        'No response from the server. Check your connection and try again.',
      )
      setMaterials(materialList)
      setSuppliers(supplierList)
      setQuantities(
        new Map(
          items.filter((item) => item.material_id).map((item) => [item.material_id as string, item.quantity]),
        ),
      )
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load materials.')
    }
  }

  // Ledger quantity where tracked, falling back to the creation-time value
  // for a material that has never had a movement recorded.
  function quantityOf(material: Material): number {
    return quantities.get(material.id) ?? material.quantity_on_hand
  }

  useEffect(() => {
    if (online) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, shop.id])

  const supplierName = useMemo(() => {
    const byId = new Map(suppliers.map((s) => [s.id, s.name]))
    return (id: string | null) => (id ? (byId.get(id) ?? null) : null)
  }, [suppliers])

  const matches = useMemo(() => {
    if (!materials) return []
    const term = search.trim().toLowerCase()
    if (!term) return materials
    return materials.filter((m) => m.name.toLowerCase().includes(term))
  }, [materials, search])

  if (!online) {
    return (
      <Screen title="Materials" back="/settings">
        <EmptyState
          spacious
          illustration={<IconTag size={48} />}
          title="No connection"
          description="Materials live on the server, so this needs a connection to load."
        />
      </Screen>
    )
  }

  return (
    <>
      <Screen
        title="Materials"
        back="/settings"
        action={
          materials && materials.length > 0 ? (
            <HeaderAction label="Add" icon={<IconPlus size={16} />} onClick={() => setAdding(true)} />
          ) : undefined
        }
      >
        <div class="space-y-4">
          {loadError && <ErrorNote>{loadError}</ErrorNote>}

          {materials === null && !loadError && (
            <div class="space-y-2">
              <Skeleton class="h-14" />
              <Skeleton class="h-14" />
            </div>
          )}

          {materials && materials.length > 0 && (
            <SearchInput
              placeholder="Search by name"
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            />
          )}

          {materials && materials.length === 0 && (
            <EmptyState
              spacious
              illustration={<IconTag size={48} />}
              title="No materials yet"
              description="Track fabric, thread, buttons, zippers, labels and packaging, with what's on hand and when to reorder."
              action={
                <Button onClick={() => setAdding(true)}>
                  <IconPlus size={18} /> Add a material
                </Button>
              }
            />
          )}

          {matches.length > 0 && (
            <Card padded={false}>
              <RowList>
                {matches.map((material) => (
                  <li key={material.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(material)}
                      class="flex min-h-tap w-full items-center gap-3 px-gutter py-3 text-left
                             transition-colors hover:bg-hover active:bg-pressed"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium">
                          {material.name}
                          {quantityOf(material) <= material.reorder_level && (
                            <span class="ml-2 text-xs font-normal text-danger">Low stock</span>
                          )}
                          {!material.active && (
                            <span class="ml-2 text-xs font-normal text-content-subtle">Inactive</span>
                          )}
                        </span>
                        <span class="block truncate text-sm text-content-muted">
                          {[
                            MATERIAL_TYPE_LABELS[material.material_type],
                            `${quantityOf(material)} ${material.unit}`,
                            supplierName(material.supplier_id),
                          ]
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

      <MaterialSheet open={adding} suppliers={suppliers} onClose={() => setAdding(false)} onSaved={reload} />
      {editing && (
        <MaterialSheet
          open={Boolean(editing)}
          material={editing}
          suppliers={suppliers}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </>
  )
}

function MaterialSheet({
  open,
  material,
  suppliers,
  onClose,
  onSaved,
}: {
  open: boolean
  material?: Material
  suppliers: Supplier[]
  onClose: () => void
  onSaved: () => void
}) {
  const { shop } = useCurrentShop()
  const [name, setName] = useState(material?.name ?? '')
  const [materialType, setMaterialType] = useState<MaterialType>(material?.material_type ?? 'fabric')
  const [unit, setUnit] = useState(material?.unit ?? 'unit')
  const [quantity, setQuantity] = useState(String(material?.quantity_on_hand ?? 0))
  const [liveQuantity, setLiveQuantity] = useState<number | null>(null)

  useEffect(() => {
    if (!material) return
    let cancelled = false
    void findInventoryItem('material', { materialId: material.id }).then((item) => {
      if (!cancelled) setLiveQuantity(item?.quantity ?? material.quantity_on_hand)
    })
    return () => {
      cancelled = true
    }
  }, [material])
  const [reorderLevel, setReorderLevel] = useState(String(material?.reorder_level ?? 0))
  const [unitCost, setUnitCost] = useState(String(material?.unit_cost_minor ?? 0))
  const [supplierId, setSupplierId] = useState(material?.supplier_id ?? '')
  const [composition, setComposition] = useState(material?.composition ?? '')
  const [gsm, setGsm] = useState(material?.gsm ? String(material.gsm) : '')
  const [width, setWidth] = useState(material?.width ?? '')
  const [colour, setColour] = useState(material?.colour ?? '')
  const [pattern, setPattern] = useState(material?.pattern ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Give the material a name.')
      return
    }
    setSaving(true)
    setError(null)
    const input: MaterialInput = {
      name,
      material_type: materialType,
      unit,
      quantity_on_hand: Math.max(0, Number(quantity) || 0),
      reorder_level: Math.max(0, Number(reorderLevel) || 0),
      unit_cost_minor: Math.max(0, Math.round(Number(unitCost) || 0)),
      supplier_id: supplierId || undefined,
      composition,
      gsm: gsm ? Number(gsm) : undefined,
      width,
      colour,
      pattern,
    }
    try {
      if (material) {
        await updateMaterial(material.id, input)
      } else {
        await createMaterial(shop.id, input)
      }
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this material.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title={material ? 'Edit material' : 'New material'} onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Name">
          <Input value={name} autofocus onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </Field>

        <Field label="Type">
          <Select
            value={materialType}
            onChange={(e) => setMaterialType((e.target as HTMLSelectElement).value as MaterialType)}
          >
            {MATERIAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {MATERIAL_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Supplier" hint="Optional.">
          <Select value={supplierId} onChange={(e) => setSupplierId((e.target as HTMLSelectElement).value)}>
            <option value="">No supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </Select>
        </Field>

        <div class="flex gap-3">
          <div class="flex-1">
            <Field label="Unit" hint="e.g. metres, pieces.">
              <Input value={unit} onInput={(e) => setUnit((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
          <div class="flex-1">
            <Field
              label={material ? 'On hand' : 'Starting quantity'}
              hint={material ? 'Adjust from the material’s Inventory page instead.' : undefined}
            >
              <Input
                type="number"
                inputmode="decimal"
                value={material ? (liveQuantity ?? '...') : quantity}
                disabled={Boolean(material)}
                onInput={(e) => setQuantity((e.target as HTMLInputElement).value)}
              />
            </Field>
          </div>
        </div>

        <div class="flex gap-3">
          <div class="flex-1">
            <Field label="Reorder at" hint="Flags low stock below this.">
              <Input
                type="number"
                inputmode="decimal"
                value={reorderLevel}
                onInput={(e) => setReorderLevel((e.target as HTMLInputElement).value)}
              />
            </Field>
          </div>
          <div class="flex-1">
            <Field label="Unit cost (minor units)">
              <Input
                type="number"
                inputmode="numeric"
                value={unitCost}
                onInput={(e) => setUnitCost((e.target as HTMLInputElement).value)}
              />
            </Field>
          </div>
        </div>

        {materialType === 'fabric' && (
          <div class="space-y-4 rounded-control bg-surface-sunken p-3">
            <p class="text-xs font-medium text-content-muted">Fabric details (optional)</p>
            <Field label="Composition" hint='e.g. "100% Cotton".'>
              <Input value={composition} onInput={(e) => setComposition((e.target as HTMLInputElement).value)} />
            </Field>
            <div class="flex gap-3">
              <div class="flex-1">
                <Field label="GSM">
                  <Input
                    type="number"
                    inputmode="numeric"
                    value={gsm}
                    onInput={(e) => setGsm((e.target as HTMLInputElement).value)}
                  />
                </Field>
              </div>
              <div class="flex-1">
                <Field label="Width">
                  <Input value={width} onInput={(e) => setWidth((e.target as HTMLInputElement).value)} />
                </Field>
              </div>
            </div>
            <div class="flex gap-3">
              <div class="flex-1">
                <Field label="Colour">
                  <Input value={colour} onInput={(e) => setColour((e.target as HTMLInputElement).value)} />
                </Field>
              </div>
              <div class="flex-1">
                <Field label="Pattern">
                  <Input value={pattern} onInput={(e) => setPattern((e.target as HTMLInputElement).value)} />
                </Field>
              </div>
            </div>
          </div>
        )}

        {material && (
          <Field label="Status">
            <Segmented
              value={material.active ? 'on' : 'off'}
              options={TOGGLE_OPTIONS}
              onChange={(value) => void setMaterialActive(material.id, value === 'on').then(onSaved)}
              label="Material status"
            />
          </Field>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save material'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
