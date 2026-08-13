/**
 * Suppliers. Online-only (see src/online/suppliers.ts).
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
  Sheet,
  Skeleton,
  Textarea,
} from '../components/ui'
import { IconChevronRight, IconPlus, IconUsers } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useOnlineFeature } from '../hooks/useOnlineFeature'
import { withTimeout } from '../lib/withTimeout'
import {
  createSupplier,
  listSuppliers,
  setSupplierActive,
  updateSupplier,
  type Supplier,
  type SupplierInput,
} from '../online/suppliers'
import { useBack } from '../hooks/useBack'

const TOGGLE_OPTIONS = [
  { value: 'on', label: 'Active' },
  { value: 'off', label: 'Inactive' },
] as const

export function Suppliers() {
  const back = useBack()
  const { shop } = useCurrentShop()
  const online = useOnlineFeature()
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)

  async function reload() {
    try {
      const list = await withTimeout(
        listSuppliers(shop.id),
        8000,
        'No response from the server. Check your connection and try again.',
      )
      setSuppliers(list)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load suppliers.')
    }
  }

  useEffect(() => {
    if (online) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, shop.id])

  const matches = useMemo(() => {
    if (!suppliers) return []
    const term = search.trim().toLowerCase()
    if (!term) return suppliers
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(term) || (s.phone ?? '').includes(term),
    )
  }, [suppliers, search])

  if (!online) {
    return (
      <Screen title="Suppliers" back={back}>
        <EmptyState
          spacious
          illustration={<IconUsers size={48} />}
          title="No connection"
          description="Suppliers live on the server, so this needs a connection to load."
        />
      </Screen>
    )
  }

  return (
    <>
      <Screen
        title="Suppliers"
        back={back}
        action={
          suppliers && suppliers.length > 0 ? (
            <HeaderAction label="Add" icon={<IconPlus size={16} />} onClick={() => setAdding(true)} />
          ) : undefined
        }
      >
        <div class="space-y-4">
          {loadError && <ErrorNote>{loadError}</ErrorNote>}

          {suppliers === null && !loadError && (
            <div class="space-y-2">
              <Skeleton class="h-14" />
              <Skeleton class="h-14" />
            </div>
          )}

          {suppliers && suppliers.length > 0 && (
            <SearchInput
              placeholder="Search by name or phone"
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            />
          )}

          {suppliers && suppliers.length === 0 && (
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

      <SupplierSheet open={adding} onClose={() => setAdding(false)} onSaved={reload} />
      {editing && (
        <SupplierSheet
          open={Boolean(editing)}
          supplier={editing}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </>
  )
}

function SupplierSheet({
  open,
  supplier,
  onClose,
  onSaved,
}: {
  open: boolean
  supplier?: Supplier
  onClose: () => void
  onSaved: () => void
}) {
  const { shop } = useCurrentShop()
  const [name, setName] = useState(supplier?.name ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [email, setEmail] = useState(supplier?.email ?? '')
  const [address, setAddress] = useState(supplier?.address ?? '')
  const [notes, setNotes] = useState(supplier?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Give the supplier a name.')
      return
    }
    setSaving(true)
    setError(null)
    const input: SupplierInput = { name, phone, email, address, notes }
    try {
      if (supplier) {
        await updateSupplier(supplier.id, input)
      } else {
        await createSupplier(shop.id, input)
      }
      onClose()
      onSaved()
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
          <Input value={name} autofocus onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Phone" hint="Optional.">
          <Input
            type="tel"
            inputmode="tel"
            value={phone}
            onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
          />
        </Field>
        <Field label="Email" hint="Optional.">
          <Input type="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Address" hint="Optional.">
          <Input value={address} onInput={(e) => setAddress((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Notes" hint="Optional.">
          <Textarea value={notes} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} />
        </Field>

        {supplier && (
          <Field label="Status">
            <Segmented
              value={supplier.active ? 'on' : 'off'}
              options={TOGGLE_OPTIONS}
              onChange={(value) => void setSupplierActive(supplier.id, value === 'on').then(onSaved)}
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
