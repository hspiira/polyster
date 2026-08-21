/* Suppliers, on the device. */
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
  Sheet,
  Textarea,
} from '../ui'
import { IconChevronRight, IconPlus, IconUsers } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useQuery } from '../hooks/useQuery'
import {
  createSupplier,
  observeSuppliers,
  setSupplierActive,
  updateSupplier,
  type SupplierInput,
} from '../db/repo'
import type { Supplier } from '../db/schema'
import { useBack } from '../hooks/useBack'
import { useDraft } from '../hooks/useDraft'
import { filterByQuery } from '../lib/search'

const TOGGLE_OPTIONS = [
  { value: 'on', label: 'Active' },
  { value: 'off', label: 'Inactive' },
] as const

interface SupplierDraft {
  name: string
  phone: string
  email: string
  address: string
  notes: string
}

export function Suppliers() {
  const back = useBack()
  const { db, shop } = useCurrentShop()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)

  const suppliers = useQuery(() => observeSuppliers(db, shop.id), [db, shop.id], [])

  const matches = useMemo(
    () => filterByQuery(suppliers, search, (s) => ({ text: [s.name], phone: [s.phone] })),
    [suppliers, search],
  )

  return (
    <>
      <Screen
        title="Suppliers"
        back={back}
        action={
          suppliers.length > 0 ? (
            <HeaderAction label="Add" icon={<IconPlus size={16} />} onClick={() => setAdding(true)} />
          ) : undefined
        }
      >
        <div class="space-y-4">
          {suppliers.length > 0 && (
            <SearchInput
              placeholder="Search by name or phone"
              value={search}
              onValue={setSearch}
            />
          )}

          {suppliers.length === 0 && (
            <EmptyState
              spacious
              illustration={<IconUsers size={48} />}
              title="No suppliers yet"
              description="Add who supplies your fabric, buttons, zippers, packaging, or outsourced work."
              action={
                <Button onClick={() => setAdding(true)}>
                  <IconPlus size={18} /> Add a supplier
                </Button>
              }
            />
          )}

          {matches.length > 0 && (
            <Card padded={false}>
              <RowList>
                {matches.map((supplier) => (
                  <li key={supplier.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(supplier)}
                      class="flex min-h-tap w-full items-center gap-3 px-gutter py-3 text-left
                             transition-colors hover:bg-hover active:bg-pressed"
                    >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium">
                          {supplier.name}
                          {!supplier.active && (
                            <span class="ml-2 text-xs font-normal text-content-subtle">Inactive</span>
                          )}
                        </span>
                        <span class="block truncate text-sm text-content-muted">
                          {[supplier.phone, supplier.email].filter(Boolean).join(' · ') || 'No contact details'}
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

      <SupplierSheet open={adding} onClose={() => setAdding(false)} />
      {editing && (
        <SupplierSheet
          open={Boolean(editing)}
          supplier={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function SupplierSheet({
  open,
  supplier,
  onClose,
}: {
  open: boolean
  supplier?: Supplier
  onClose: () => void
}) {
  const { db, shop } = useCurrentShop()
  const { draft, set } = useDraft<SupplierDraft>(() => ({
    name: supplier?.name ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    address: supplier?.address ?? '',
    notes: supplier?.notes ?? '',
  }))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('Give the supplier a name.')
      return
    }
    setSaving(true)
    setError(null)
    const input: SupplierInput = { ...draft }
    try {
      if (supplier) {
        await updateSupplier(db, supplier.id, input)
      } else {
        await createSupplier(db, shop.id, input)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this supplier.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title={supplier ? 'Edit supplier' : 'New supplier'} onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Name">
          <Input value={draft.name} autofocus onValue={(v) => set('name', v)} />
        </Field>
        <Field label="Phone" hint="Optional.">
          <Input
            type="tel"
            inputmode="tel"
            value={draft.phone}
            onValue={(v) => set('phone', v)}
          />
        </Field>
        <Field label="Email" hint="Optional.">
          <Input type="email" value={draft.email} onValue={(v) => set('email', v)} />
        </Field>
        <Field label="Address" hint="Optional.">
          <Input value={draft.address} onValue={(v) => set('address', v)} />
        </Field>
        <Field label="Notes" hint="Optional.">
          <Textarea value={draft.notes} onValue={(v) => set('notes', v)} />
        </Field>

        {supplier && (
          <Field label="Status">
            <Segmented
              value={supplier.active ? 'on' : 'off'}
              options={TOGGLE_OPTIONS}
              onChange={(value) => void setSupplierActive(db, supplier.id, value === 'on')}
              label="Supplier status"
            />
          </Field>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save supplier'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
