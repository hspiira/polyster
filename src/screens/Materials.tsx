/* Materials, on the device. */
import { useMemo, useState } from 'preact/hooks'
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
} from '../ui'
import { IconChevronRight, IconPlus, IconTag } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useQuery } from '../hooks/useQuery'
import {
  createMaterial,
  findInventoryItem,
  liveQuery,
  observeInventoryItems,
  observeMaterials,
  observeSuppliers,
  setMaterialActive,
  updateMaterial,
  type MaterialInput,
} from '../db/repo'
import { MATERIAL_TYPES, type Material, type MaterialType, type Supplier } from '../db/schema'
import { useBack } from '../hooks/useBack'
import { useDraft } from '../hooks/useDraft'
import { filterByQuery } from '../lib/search'

interface MaterialDraft {
  name: string
  materialType: MaterialType
  unit: string
  quantity: string
  reorderLevel: string
  unitCost: string
  supplierId: string
  composition: string
  gsm: string
  width: string
  colour: string
  pattern: string
}

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
  const back = useBack()
  const { db, shop } = useCurrentShop()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)

  const materials = useQuery(() => observeMaterials(db, shop.id), [db, shop.id], [])
  const suppliers = useQuery(() => observeSuppliers(db, shop.id), [db, shop.id], [])
  const items = useQuery(() => observeInventoryItems(db, shop.id), [db, shop.id], [])

  const quantities = useMemo(
    () =>
      new Map(
        items
          .filter((item) => item.material_id)
          .map((item) => [item.material_id as string, item.quantity]),
      ),
    [items],
  )

  // Ledger quantity where tracked, falling back to the creation-time value
  // for a material that has never had a movement recorded.
  function quantityOf(material: Material): number {
    return quantities.get(material.id) ?? material.quantity_on_hand
  }

  const supplierName = useMemo(() => {
    const byId = new Map(suppliers.map((s) => [s.id, s.name]))
    return (id: string | null) => (id ? (byId.get(id) ?? null) : null)
  }, [suppliers])

  const matches = useMemo(
    () => filterByQuery(materials, search, (m) => ({ text: [m.name] })),
    [materials, search],
  )

  return (
    <>
      <Screen
        title="Materials"
        back={back}
        action={
          materials.length > 0 ? (
            <HeaderAction label="Add" icon={<IconPlus size={16} />} onClick={() => setAdding(true)} />
          ) : undefined
        }
      >
        <div class="space-y-4">
          {materials.length > 0 && (
            <SearchInput
              placeholder="Search by name"
              value={search}
              onValue={setSearch}
            />
          )}

          {materials.length === 0 && (
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

      <MaterialSheet open={adding} suppliers={suppliers} onClose={() => setAdding(false)} />
      {editing && (
        <MaterialSheet
          open={Boolean(editing)}
          material={editing}
          suppliers={suppliers}
          onClose={() => setEditing(null)}
         
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
}: {
  open: boolean
  material?: Material
  suppliers: Supplier[]
  onClose: () => void
}) {
  const { db, shop } = useCurrentShop()
  const { draft, set } = useDraft<MaterialDraft>(() => ({
    name: material?.name ?? '',
    materialType: material?.material_type ?? 'fabric',
    unit: material?.unit ?? 'unit',
    quantity: String(material?.quantity_on_hand ?? 0),
    reorderLevel: String(material?.reorder_level ?? 0),
    unitCost: String(material?.unit_cost_minor ?? 0),
    supplierId: material?.supplier_id ?? '',
    composition: material?.composition ?? '',
    gsm: material?.gsm ? String(material.gsm) : '',
    width: material?.width ?? '',
    colour: material?.colour ?? '',
    pattern: material?.pattern ?? '',
  }))
  // What the ledger says now, which is what the form must show rather than
  // the balance the material was created with.
  const stock = useQuery(
    () =>
      liveQuery(async () =>
        material ? findInventoryItem(db, shop.id, 'material', { materialId: material.id }) : null,
      ),
    [db, shop.id, material?.id],
    null,
  )
  const liveQuantity = material ? (stock?.quantity ?? material.quantity_on_hand) : null

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('Give the material a name.')
      return
    }
    setSaving(true)
    setError(null)
    const input: MaterialInput = {
      name: draft.name,
      material_type: draft.materialType,
      unit: draft.unit,
      quantity_on_hand: Math.max(0, Number(draft.quantity) || 0),
      reorder_level: Math.max(0, Number(draft.reorderLevel) || 0),
      unit_cost_minor: Math.max(0, Math.round(Number(draft.unitCost) || 0)),
      supplier_id: draft.supplierId || undefined,
      composition: draft.composition,
      gsm: draft.gsm ? Number(draft.gsm) : undefined,
      width: draft.width,
      colour: draft.colour,
      pattern: draft.pattern,
    }
    try {
      if (material) {
        await updateMaterial(db, material.id, input)
      } else {
        await createMaterial(db, shop.id, input)
      }
      onClose()
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
          <Input value={draft.name} autofocus onValue={(v) => set('name', v)} />
        </Field>

        <Field label="Type">
          <Select
            value={draft.materialType}
            onValue={(v) => set('materialType', v as MaterialType)}
          >
            {MATERIAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {MATERIAL_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Supplier" hint="Optional.">
          <Select value={draft.supplierId} onValue={(v) => set('supplierId', v)}>
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
              <Input value={draft.unit} onValue={(v) => set('unit', v)} />
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
                value={material ? (liveQuantity ?? '...') : draft.quantity}
                disabled={Boolean(material)}
                onValue={(v) => set('quantity', v)}
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
                value={draft.reorderLevel}
                onValue={(v) => set('reorderLevel', v)}
              />
            </Field>
          </div>
          <div class="flex-1">
            <Field label="Unit cost (minor units)">
              <Input
                type="number"
                inputmode="numeric"
                value={draft.unitCost}
                onValue={(v) => set('unitCost', v)}
              />
            </Field>
          </div>
        </div>

        {draft.materialType === 'fabric' && (
          <div class="space-y-4 rounded-control bg-surface-sunken p-3">
            <p class="text-xs font-medium text-content-muted">Fabric details (optional)</p>
            <Field label="Composition" hint='e.g. "100% Cotton".'>
              <Input value={draft.composition} onValue={(v) => set('composition', v)} />
            </Field>
            <div class="flex gap-3">
              <div class="flex-1">
                <Field label="GSM">
                  <Input
                    type="number"
                    inputmode="numeric"
                    value={draft.gsm}
                    onValue={(v) => set('gsm', v)}
                  />
                </Field>
              </div>
              <div class="flex-1">
                <Field label="Width">
                  <Input value={draft.width} onValue={(v) => set('width', v)} />
                </Field>
              </div>
            </div>
            <div class="flex gap-3">
              <div class="flex-1">
                <Field label="Colour">
                  <Input value={draft.colour} onValue={(v) => set('colour', v)} />
                </Field>
              </div>
              <div class="flex-1">
                <Field label="Pattern">
                  <Input value={draft.pattern} onValue={(v) => set('pattern', v)} />
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
              onChange={(value) => void setMaterialActive(db, material.id, value === 'on')}
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
