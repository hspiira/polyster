/**
 * One client: their details, their measurements, and their orders.
 *
 * The measurement form is rendered from `measurement_fields`, which each shop
 * configures for itself (Settings -> Measurements). That indirection is the
 * thing that makes one app fit a suit tailor and a dressmaker without a fork
 * -- see pwa-schema-and-screens.md section 1.
 */
import { useEffect, useMemo, useState } from 'preact/hooks'
import { useRoute } from 'preact-iso'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  ListRow,
  Screen,
  Textarea,
} from '../components/ui'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { saveMeasurements, updateClient } from '../db/writes'
import { formatMoney } from '../lib/money'
import { formatDueDate } from '../lib/dates'
import { STAGE_LABELS, STAGE_TONES } from './orderStage'

export function ClientDetail() {
  const { params } = useRoute()
  const clientId = params.id ?? ''
  const { db, shop } = useCurrentShop()

  const clientDocs = useRxQuery(() => db.clients.findOne(clientId).$, [db, clientId], null)
  const client = clientDocs?.toJSON() ?? null

  const orderDocs = useRxQuery(
    () =>
      db.orders.find({
        selector: { shop_id: shop.id, client_id: clientId },
        sort: [{ pickup_due_date: 'desc' }],
      }).$,
    [db, shop.id, clientId],
    [],
  )
  const orders = useMemo(() => orderDocs.map((doc) => doc.toJSON()), [orderDocs])

  if (!client) {
    return (
      <Screen title="Client">
        <EmptyState
          title="Client not found"
          description="They may have been removed, or this device has not synced them yet."
          action={
            <a href="/clients">
              <Button variant="secondary">Back to clients</Button>
            </a>
          }
        />
      </Screen>
    )
  }

  return (
    <Screen
      title={client.name}
      action={
        <a href={`/orders/new?client=${client.id}`}>
          <Button class="px-3">New order</Button>
        </a>
      }
    >
      <div class="space-y-4">
        <ClientFacts clientId={clientId} name={client.name} phone={client.phone} notes={client.notes} />
        <Measurements clientId={clientId} />

        <section class="space-y-2">
          <h2 class="text-sm font-medium text-gray-700">Orders</h2>
          {orders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              description={`Nothing has been ordered by ${client.name} so far.`}
              action={
                <a href={`/orders/new?client=${client.id}`}>
                  <Button>Take an order</Button>
                </a>
              }
            />
          ) : (
            <Card class="!p-0">
              <ul class="px-3">
                {orders.map((order) => (
                  <li key={order.id}>
                    <ListRow href={`/orders/${order.id}`}>
                      <span class="min-w-0">
                        <span class="block truncate font-medium text-gray-900">
                          {order.item_description}
                        </span>
                        <span class="block text-sm text-gray-500">
                          {formatMoney(order.price_total)} · due {formatDueDate(order.pickup_due_date)}
                        </span>
                      </span>
                      <Chip tone={STAGE_TONES[order.stage]}>{STAGE_LABELS[order.stage]}</Chip>
                    </ListRow>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      </div>
    </Screen>
  )
}

function ClientFacts({
  clientId,
  name,
  phone,
  notes,
}: {
  clientId: string
  name: string
  phone?: string
  notes?: string
}) {
  const { db } = useCurrentShop()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ name, phone: phone ?? '', notes: notes ?? '' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft({ name, phone: phone ?? '', notes: notes ?? '' })
  }, [name, phone, notes])

  if (!editing) {
    return (
      <Card>
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 space-y-1 text-sm">
            <p class="text-gray-900">{phone ?? <span class="text-gray-400">No phone number</span>}</p>
            {notes && <p class="whitespace-pre-wrap text-gray-600">{notes}</p>}
          </div>
          <Button variant="ghost" class="px-2" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      </Card>
    )
  }

  async function save(event: Event) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('A name is needed to find this client again.')
      return
    }
    try {
      await updateClient(db, clientId, draft)
      setEditing(false)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <Card>
      <form onSubmit={save} class="space-y-3">
        <Field label="Name">
          <Input
            value={draft.name}
            onInput={(e) => setDraft({ ...draft, name: (e.target as HTMLInputElement).value })}
          />
        </Field>
        <Field label="Phone">
          <Input
            type="tel"
            inputmode="tel"
            value={draft.phone}
            onInput={(e) => setDraft({ ...draft, phone: (e.target as HTMLInputElement).value })}
          />
        </Field>
        <Field label="Notes">
          <Textarea
            value={draft.notes}
            onInput={(e) => setDraft({ ...draft, notes: (e.target as HTMLTextAreaElement).value })}
          />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div class="flex gap-2">
          <Button variant="secondary" class="flex-1" type="button" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit">
            Save
          </Button>
        </div>
      </form>
    </Card>
  )
}

function Measurements({ clientId }: { clientId: string }) {
  const { db, shop, activeStaff } = useCurrentShop()

  const fieldDocs = useRxQuery(
    () =>
      db.measurement_fields.find({
        selector: { shop_id: shop.id },
        sort: [{ display_order: 'asc' }],
      }).$,
    [db, shop.id],
    [],
  )
  const fields = useMemo(() => fieldDocs.map((doc) => doc.toJSON()), [fieldDocs])

  const profileDoc = useRxQuery(
    () => db.measurement_profiles.findOne({ selector: { client_id: clientId } }).$,
    [db, clientId],
    null,
  )

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stored = useMemo(() => profileDoc?.toJSON().values ?? {}, [profileDoc])

  // Keep the form in step with what replication brings in, but never clobber
  // half-typed input -- a measurement arriving from the other device mid-entry
  // must not wipe what is being typed here.
  useEffect(() => {
    if (dirty) return
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(stored)) next[key] = String(value)
    setDraft(next)
  }, [stored, dirty])

  if (fields.length === 0) {
    return (
      <Card>
        <h2 class="font-medium text-gray-900">Measurements</h2>
        <p class="mt-1 text-sm text-gray-600">
          This shop has not set up any measurement fields yet. Choose the ones you actually take --
          chest and waist, or bust and hip, or whatever your work needs.
        </p>
        <a href="/settings/measurements" class="mt-3 block">
          <Button variant="secondary" class="w-full">
            Set up measurement fields
          </Button>
        </a>
      </Card>
    )
  }

  async function save(event: Event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      // Blank fields are dropped rather than stored as empty strings, so an
      // unrecorded measurement stays visibly unrecorded.
      const values: Record<string, string> = {}
      for (const [key, value] of Object.entries(draft)) {
        if (value.trim()) values[key] = value.trim()
      }
      await saveMeasurements(db, clientId, values, activeStaff?.id)
      setDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save measurements.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <form onSubmit={save} class="space-y-3">
        <h2 class="font-medium text-gray-900">Measurements</h2>

        <div class="grid grid-cols-2 gap-3">
          {fields.map((field) => (
            <Field key={field.id} label={field.unit ? `${field.label} (${field.unit})` : field.label}>
              <Input
                inputmode="decimal"
                value={draft[field.id] ?? ''}
                onInput={(e) => {
                  setDirty(true)
                  setDraft({ ...draft, [field.id]: (e.target as HTMLInputElement).value })
                }}
              />
            </Field>
          ))}
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" class="w-full" disabled={!dirty || saving}>
          {saving ? 'Saving...' : dirty ? 'Save measurements' : 'Saved'}
        </Button>
      </form>
    </Card>
  )
}
