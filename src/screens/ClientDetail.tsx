/**
 * One client: who they are on the left, everything about them on the right.
 *
 * The measurement form is rendered from `measurement_fields`, which each shop
 * configures for itself. That indirection is what makes one app fit a suit
 * tailor and a dressmaker without a fork -- pwa-schema-and-screens.md s1.
 *
 * The profile is a sticky rail rather than a card at the top because contact
 * details are what you check *while* reading something else -- stacked, they
 * scroll away exactly when wanted.
 */
import { useEffect, useMemo, useState } from 'preact/hooks'
import { useRoute } from 'preact-iso'
import {
  Avatar,
  Button,
  Card,
  Chip,
  DataRow,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  ListRow,
  RowList,
  Screen,
  SectionTitle,
  Sheet,
  Textarea,
} from '../ui'
import { IconEdit, IconPlus, IconWhatsApp } from '../components/icons'
import {
  IllustrationMeasure,
  IllustrationOrders,
  IllustrationSearch,
} from '../components/illustrations'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances } from '../db/balances'
import { saveMeasurements, updateClient } from '../db/writes'
import { formatMinor } from '../lib/money'
import { formatDueDate } from '../lib/dates'
import { toWaNumber } from '../lib/whatsapp'
import { STAGE_LABELS, STAGE_TONES } from './orderStage'
import { useBack } from '../hooks/useBack'
import type { ClientDoc } from '../db/schema'

export function ClientDetail() {
  const back = useBack()
  const { params } = useRoute()
  const clientId = params.id ?? ''
  const { db, shop } = useCurrentShop()

  const clientDoc = useRxQuery(() => db.clients.findOne(clientId).$, [db, clientId], null)
  const client = clientDoc?.toJSON() ?? null

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

  const balances = useRxQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())

  const outstandingMinor = useMemo(
    () =>
      orders.reduce((sum, order) => {
        if (order.stage === 'cancelled') return sum
        const balance = balances.get(order.id)
        return balance && balance.balance_minor > 0 ? sum + balance.balance_minor : sum
      }, 0),
    [orders, balances],
  )

  const [editing, setEditing] = useState(false)

  if (!client) {
    return (
      <Screen title="Client" back={back}>
        <EmptyState
          spacious
          illustration={<IllustrationSearch size={112} />}
          title="Client not found"
          description="They may have been removed, or this device has not synced them yet."
          action={
            <Button linkTo="/clients" variant="secondary">
              Back to clients
            </Button>
          }
        />
      </Screen>
    )
  }

  return (
    <Screen
      title={client.name}
      back={back}
      width="wide"
      action={
        <Button variant="ghost" size="sm" aria-label="Edit client" onClick={() => setEditing(true)}>
          <IconEdit size={20} />
        </Button>
      }
    >
      <div class="lg:grid lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start lg:gap-5">
        <ProfilePanel
          client={client}
          orderCount={orders.length}
          outstandingMinor={outstandingMinor}
          currency={shop.currency}
        />

        <div class="mt-5 space-y-5 lg:mt-0">
          <Measurements clientId={clientId} />

          <section>
            <SectionTitle
              action={
                <a
                  href={`/orders/new?client=${client.id}`}
                  class="flex items-center gap-1 text-xs font-semibold text-accent"
                >
                  <IconPlus size={14} /> New
                </a>
              }
            >
              Orders
            </SectionTitle>

            {orders.length === 0 ? (
              <EmptyState
                illustration={<IllustrationOrders size={72} />}
                title="No orders yet"
                description={`Nothing has been ordered by ${client.name} so far.`}
                action={<Button linkTo={`/orders/new?client=${client.id}`}>Take an order</Button>}
              />
            ) : (
              <Card padded={false}>
                <RowList>
                  {orders.map((order) => (
                    <li key={order.id}>
                      <ListRow
                        href={`/orders/${order.id}`}
                        trailing={
                          <Chip tone={STAGE_TONES[order.stage]}>{STAGE_LABELS[order.stage]}</Chip>
                        }
                      >
                        <span class="block truncate font-medium">{order.summary}</span>
                        <span class="block text-sm text-content-muted">
                          {formatMinor(order.price_total_minor, order.currency)} · due{' '}
                          {formatDueDate(order.pickup_due_date)}
                        </span>
                      </ListRow>
                    </li>
                  ))}
                </RowList>
              </Card>
            )}
          </section>
        </div>
      </div>

      <EditClientSheet
        open={editing}
        onClose={() => setEditing(false)}
        clientId={clientId}
        name={client.name}
        phone={client.phone}
        notes={client.notes}
      />
    </Screen>
  )
}

/** `top-16` clears the sticky page header, which is opaque and would cover this. */
function ProfilePanel({
  client,
  orderCount,
  outstandingMinor,
  currency,
}: {
  client: ClientDoc
  orderCount: number
  outstandingMinor: number
  currency: string
}) {
  const waNumber = toWaNumber(client.phone)

  return (
    <aside class="lg:sticky lg:top-16">
      <Card>
        <div class="flex items-center gap-3">
          <Avatar name={client.name} size="lg" />
          <div class="min-w-0">
            {client.phone ? (
              <a
                href={`tel:${client.phone}`}
                class="text-sm text-content-muted transition-colors hover:text-content"
              >
                {client.phone}
              </a>
            ) : (
              <p class="text-sm text-content-subtle">No phone number</p>
            )}
          </div>
        </div>

        {waNumber && (
          <Button
            variant="secondary"
            block
            class="mt-3"
            linkTo={`https://wa.me/${waNumber}`}
            target="_blank"
            rel="noreferrer"
          >
            <IconWhatsApp size={18} /> Message
          </Button>
        )}

        <dl class="mt-4 border-t border-line pt-2">
          <DataRow label="Orders">{orderCount}</DataRow>
          <DataRow label="Outstanding">
            {outstandingMinor > 0 ? (
              <span class="text-money">{formatMinor(outstandingMinor, currency)}</span>
            ) : (
              <span class="text-content-subtle">Nothing owed</span>
            )}
          </DataRow>
        </dl>

        {client.notes && (
          <p class="mt-3 border-t border-line pt-3 text-sm whitespace-pre-wrap text-content-muted">
            {client.notes}
          </p>
        )}

      </Card>
    </aside>
  )
}

function EditClientSheet({
  open,
  onClose,
  clientId,
  name,
  phone,
  notes,
}: {
  open: boolean
  onClose: () => void
  clientId: string
  name: string
  phone?: string
  notes?: string
}) {
  const { db } = useCurrentShop()
  const [draft, setDraft] = useState({ name, phone: phone ?? '', notes: notes ?? '' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft({ name, phone: phone ?? '', notes: notes ?? '' })
  }, [name, phone, notes])

  async function save(event: Event) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('A name is needed to find this client again.')
      return
    }
    try {
      await updateClient(db, clientId, draft)
      setError(null)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <Sheet open={open} title="Edit client" onClose={onClose}>
      <form onSubmit={save} class="space-y-4">
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
        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit">
            Save
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function Measurements({ clientId }: { clientId: string }) {
  const { db, shop, activeStaff } = useCurrentShop()

  // $ne rather than true, so fields predating this column (undefined active)
  // still count as active instead of being silently dropped from the form.
  const fieldDocs = useRxQuery(
    () =>
      db.measurement_fields.find({
        selector: { shop_id: shop.id, active: { $ne: false } },
        sort: [{ display_order: 'asc' }],
      }).$,
    [db, shop.id],
    [],
  )
  const fields = useMemo(() => fieldDocs.map((doc) => doc.toJSON()), [fieldDocs])

  // Retired fields load separately so a recorded value can still be shown,
  // read-only, instead of becoming unlabellable once a field is retired.
  const retiredFieldDocs = useRxQuery(
    () =>
      db.measurement_fields.find({
        selector: { shop_id: shop.id, active: false },
        sort: [{ display_order: 'asc' }],
      }).$,
    [db, shop.id],
    [],
  )
  const retiredFields = useMemo(
    () => retiredFieldDocs.map((doc) => doc.toJSON()),
    [retiredFieldDocs],
  )

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

  // The retired-field fix: a value recorded against a since-retired field
  // must stay visible and labelled, just no longer editable.
  const retiredWithValue = useMemo(
    () => retiredFields.filter((field) => stored[field.id] !== undefined),
    [retiredFields, stored],
  )

  // Keep in step with what replication brings in, but never clobber
  // half-typed input: a measurement arriving from the other device mid-entry
  // must not wipe what is being typed here.
  useEffect(() => {
    if (dirty) return
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(stored)) next[key] = String(value)
    setDraft(next)
  }, [stored, dirty])

  if (fields.length === 0 && retiredWithValue.length === 0) {
    return (
      <section>
        <SectionTitle>Measurements</SectionTitle>
        <EmptyState
          illustration={<IllustrationMeasure size={72} />}
          title="No measurement fields set up"
          description="Choose the measurements you actually take: chest and waist, or bust and hip, or whatever your work needs."
          action={
            <Button linkTo="/settings/measurements" variant="secondary">
              Set them up
            </Button>
          }
        />
      </section>
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
    <section>
      <SectionTitle>Measurements</SectionTitle>
      <Card>
        <form onSubmit={save} class="space-y-4">
          <div class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
            {fields.map((field) => (
              <Field
                key={field.id}
                label={field.unit ? `${field.label} (${field.unit})` : field.label}
              >
                <Input
                  inputmode="decimal"
                  placeholder="—"
                  value={draft[field.id] ?? ''}
                  onInput={(e) => {
                    setDirty(true)
                    setDraft({ ...draft, [field.id]: (e.target as HTMLInputElement).value })
                  }}
                />
              </Field>
            ))}
            {retiredWithValue.map((field) => (
              <Field
                key={field.id}
                label={`${field.unit ? `${field.label} (${field.unit})` : field.label} (retired)`}
              >
                <Input value={String(stored[field.id])} disabled readOnly />
              </Field>
            ))}
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          <Button type="submit" block disabled={!dirty || saving}>
            {saving ? 'Saving...' : dirty ? 'Save measurements' : 'Saved'}
          </Button>
        </form>
      </Card>
    </section>
  )
}
