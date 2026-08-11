/**
 * One client, at a desk.
 *
 * A full page rather than the inspector pattern Orders uses. A client record is
 * not a summary you glance at while working a list: it holds a measurement form,
 * a history of orders and free-text notes, none of which fit a 21rem pane and
 * all of which are things you sit down to do.
 *
 * Tabs rather than one long scroll, because the three things here are asked for
 * separately -- you came to take a measurement, or to see what they have
 * ordered, or to correct a phone number, and never all three at once.
 */
import { useEffect, useMemo, useState } from 'preact/hooks'
import { useRoute } from 'preact-iso'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeShopBalances } from '../db/balances'
import { saveMeasurements, updateClient } from '../db/writes'
import { formatMinor } from '../lib/money'
import { dueBucket, formatDate, formatDateTime, formatDueDate, today } from '../lib/dates'
import { waLink, suggestedMessage } from '../lib/whatsapp'
import { STAGE_LABELS, STAGE_TONES } from '../screens/orderStage'
import { OPEN_STAGES } from '../screens/today/todayModel'
import type { OrderDoc } from '../db/schema'
import { Chip, EmptyState, getInitials } from '../ui'
import { IconOrders, IconWhatsApp } from '../components/icons'
import { cn } from '../lib/cn'
import { Page, PageTab } from './Page'
import { Table, type TableColumn } from './Table'
import { CONTROL, CONTROL_SM, RADIUS, TEXT_SM, TEXT_XS } from './chrome'

type Tab = 'orders' | 'measurements' | 'details'

export function ClientDetailPage() {
  const { params } = useRoute()
  const clientId = params.id ?? ''
  const { db, shop } = useCurrentShop()
  const [tab, setTab] = useState<Tab>('orders')

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
  const balances = useRxQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())

  const orders = useMemo(() => orderDocs.map((doc) => doc.toJSON()), [orderDocs])

  const summary = useMemo(() => {
    let open = 0
    let owed = 0
    for (const order of orders) {
      if (OPEN_STAGES.includes(order.stage)) open += 1
      if (order.stage === 'cancelled') continue
      const balance = balances.get(order.id)?.balance_minor ?? 0
      if (balance > 0) owed += balance
    }
    return { open, owed, total: orders.length }
  }, [orders, balances])

  if (!client) {
    return (
      <Page crumbs={['Work', 'Clients']} title="Client">
        <EmptyState
          title="Client not found"
          description="They may have been removed, or this device has not synced them yet."
        />
      </Page>
    )
  }

  /**
   * Only offered when there is an order to talk about.
   *
   * `suggestedMessage` writes about a specific order and dereferences both it
   * and its balance, so a client with no orders yet has nothing for it to say
   * and would throw rather than degrade. The button is absent in that case,
   * which is honest: there is no update to send.
   */
  const latest = orders[0]
  const latestBalance = latest ? balances.get(latest.id) : undefined
  const messageLink =
    latest && latestBalance
      ? waLink(
          client.phone,
          suggestedMessage({
            shopName: shop.name,
            clientName: client.name,
            order: latest,
            balance: latestBalance,
          }),
        )
      : null

  const columns: TableColumn<OrderDoc>[] = [
    {
      id: 'summary',
      label: 'Order',
      width: 'minmax(9rem, 2.4fr)',
      render: (order) => <span class="truncate font-semibold">{order.summary}</span>,
    },
    {
      id: 'stage',
      label: 'Stage',
      width: '6rem',
      render: (order) => <Chip tone={STAGE_TONES[order.stage]}>{STAGE_LABELS[order.stage]}</Chip>,
    },
    {
      id: 'due',
      label: 'Due',
      width: '6.5rem',
      render: (order) => {
        const stillDue = order.stage !== 'picked_up' && order.stage !== 'returned'
        const late = stillDue && dueBucket(order.pickup_due_date, today()) === 'overdue'
        return (
          <span class={cn(late && 'font-semibold text-danger')}>
            {formatDueDate(order.pickup_due_date)}
          </span>
        )
      },
    },
    {
      id: 'owed',
      label: 'Owed',
      width: '6.5rem',
      align: 'end',
      render: (order) => {
        const owed = Math.max(0, balances.get(order.id)?.balance_minor ?? 0)
        return owed > 0 ? (
          <span class="font-semibold text-money">{formatMinor(owed, shop.currency)}</span>
        ) : (
          <span class="text-content-subtle">Paid</span>
        )
      },
    },
  ]

  return (
    <Page
      crumbs={['Work', 'Clients']}
      title={client.name}
      actions={
        <span class="flex shrink-0 gap-1.5">
          {messageLink && (
            <a
              href={messageLink}
              target="_blank"
              rel="noreferrer"
              class={cn(
                'flex items-center gap-1.5 bg-surface-sunken px-2.5 font-semibold text-content',
                'hover:bg-pressed',
                CONTROL_SM,
                RADIUS,
                TEXT_SM,
              )}
            >
              <IconWhatsApp size={14} /> Message
            </a>
          )}
          <a
            href={`/orders/new?client=${client.id}`}
            class={cn(
              'flex items-center bg-accent px-2.5 font-semibold text-accent-content',
              'hover:brightness-110',
              CONTROL_SM,
              RADIUS,
              TEXT_SM,
            )}
          >
            New order
          </a>
        </span>
      }
      tabs={
        <>
          <PageTab selected={tab === 'orders'} onClick={() => setTab('orders')}>
            Orders
          </PageTab>
          <PageTab selected={tab === 'measurements'} onClick={() => setTab('measurements')}>
            Measurements
          </PageTab>
          <PageTab selected={tab === 'details'} onClick={() => setTab('details')}>
            Details
          </PageTab>
        </>
      }
    >
      <div class="flex min-h-0 flex-1 flex-col gap-2.5">
        {/* The three facts that decide how you talk to someone, above whichever
            tab is open, because they are true regardless of which you chose. */}
        <div class="flex flex-wrap items-center gap-2.5">
          <span
            class="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px]
                   font-bold text-accent-on-soft"
            aria-hidden="true"
          >
            {getInitials(client.name)}
          </span>
          <Fact label="Phone" value={client.phone ?? 'None'} />
          <Fact label="Open orders" value={String(summary.open)} />
          <Fact label="All orders" value={String(summary.total)} />
          <Fact
            label="Owed"
            value={formatMinor(summary.owed, shop.currency)}
            tone={summary.owed > 0 ? 'money' : undefined}
          />
        </div>

        {tab === 'orders' && (
          <Table
            label={`Orders for ${client.name}`}
            items={orders}
            columns={columns}
            getKey={(order) => order.id}
            href={(order) => `/orders?open=${order.id}`}
            empty={
              <EmptyState
                illustration={<IconOrders size={22} />}
                title="No orders yet"
                description={`Nothing has been ordered by ${client.name} so far.`}
              />
            }
          />
        )}

        {tab === 'measurements' && <Measurements clientId={clientId} />}

        {tab === 'details' && <Details clientId={clientId} client={client} />}
      </div>
    </Page>
  )
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'money'
}) {
  return (
    <span class={cn('bg-surface px-3 py-1.5', RADIUS)}>
      <span class={cn('block text-content-muted', TEXT_XS)}>{label}</span>
      <span
        class={cn(
          'block font-semibold tabular-nums',
          TEXT_SM,
          tone === 'money' && 'text-money',
        )}
      >
        {value}
      </span>
    </span>
  )
}

/**
 * The measurement form, rendered from the shop's own field list.
 *
 * Wider than the phone's two columns because there is room: `auto-fit` rather
 * than a fixed count, so it is three or five across depending on the pane, and
 * correct in the middle without a breakpoint.
 */
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
  const profileDoc = useRxQuery(
    () => db.measurement_profiles.findOne({ selector: { client_id: clientId } }).$,
    [db, clientId],
    null,
  )

  const fields = useMemo(() => fieldDocs.map((doc) => doc.toJSON()), [fieldDocs])
  const stored = useMemo(() => profileDoc?.toJSON().values ?? {}, [profileDoc])
  const updatedAt = profileDoc?.toJSON().updated_at

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep in step with replication, but never clobber half-typed input: a
  // measurement arriving from the other device mid-entry must not wipe this.
  useEffect(() => {
    if (dirty) return
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(stored)) next[key] = String(value)
    setDraft(next)
  }, [stored, dirty])

  if (fields.length === 0) {
    return (
      <EmptyState
        title="No measurement fields set up"
        description="Choose the measurements you actually take — chest and waist, or bust and hip — and the form is built from them."
        action={
          <a
            href="/settings/measurements"
            class={cn(
              'flex items-center bg-accent px-3 font-semibold text-accent-content',
              CONTROL,
              RADIUS,
              TEXT_SM,
            )}
          >
            Set them up
          </a>
        }
      />
    )
  }

  async function save(event: Event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      // Blank fields are dropped rather than stored empty, so an unrecorded
      // measurement stays visibly unrecorded.
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
    <form onSubmit={save} class={cn('flex min-h-0 flex-col overflow-hidden bg-surface p-3.5', RADIUS)}>
      <div class="grid min-h-0 grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-3 gap-y-2.5 overflow-y-auto">
        {fields.map((field) => (
          <label key={field.id} class="block">
            <span class={cn('mb-1 block font-medium text-content-muted', TEXT_XS)}>
              {field.label}
              {field.unit && <span class="text-content-subtle"> ({field.unit})</span>}
            </span>
            <input
              inputMode="decimal"
              placeholder="—"
              value={draft[field.id] ?? ''}
              onInput={(event) => {
                setDirty(true)
                setDraft({ ...draft, [field.id]: (event.target as HTMLInputElement).value })
              }}
              class={cn(
                'w-full border border-line-strong bg-page px-2.5 text-content outline-none',
                'focus:border-accent focus:ring-2 focus:ring-focus/25',
                CONTROL,
                RADIUS,
                TEXT_SM,
              )}
            />
          </label>
        ))}
      </div>

      {error && (
        <p role="alert" class={cn('mt-2.5 bg-danger-soft px-2.5 py-1.5 text-danger', RADIUS, TEXT_XS)}>
          {error}
        </p>
      )}

      <div class="mt-3 flex shrink-0 items-center gap-2.5">
        <button
          type="submit"
          disabled={!dirty || saving}
          class={cn(
            'bg-accent px-3 font-semibold text-accent-content hover:brightness-110',
            'disabled:pointer-events-none disabled:opacity-45',
            CONTROL,
            RADIUS,
            TEXT_SM,
          )}
        >
          {saving ? 'Saving…' : dirty ? 'Save measurements' : 'Saved'}
        </button>
        {updatedAt && !dirty && (
          <span class={cn('text-content-subtle', TEXT_XS)}>
            Last taken {formatDateTime(updatedAt)}
          </span>
        )}
      </div>
    </form>
  )
}

function Details({
  clientId,
  client,
}: {
  clientId: string
  client: { name: string; phone?: string; notes?: string; created_at?: string }
}) {
  const { db } = useCurrentShop()
  const [draft, setDraft] = useState({
    name: client.name,
    phone: client.phone ?? '',
    notes: client.notes ?? '',
  })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft({ name: client.name, phone: client.phone ?? '', notes: client.notes ?? '' })
  }, [client.name, client.phone, client.notes])

  async function save(event: Event) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('A name is needed to find this client again.')
      return
    }
    try {
      await updateClient(db, clientId, draft)
      setError(null)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  const inputClass = cn(
    'w-full border border-line-strong bg-page px-2.5 text-content outline-none',
    'focus:border-accent focus:ring-2 focus:ring-focus/25',
    RADIUS,
    TEXT_SM,
  )

  return (
    <form onSubmit={save} class={cn('bg-surface p-3.5', RADIUS)}>
      <div class="grid max-w-[42rem] grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3">
        <label class="block">
          <span class={cn('mb-1 block font-medium text-content-muted', TEXT_XS)}>Name</span>
          <input
            value={draft.name}
            onInput={(event) => {
              setSaved(false)
              setDraft({ ...draft, name: (event.target as HTMLInputElement).value })
            }}
            class={cn(inputClass, CONTROL)}
          />
        </label>
        <label class="block">
          <span class={cn('mb-1 block font-medium text-content-muted', TEXT_XS)}>Phone</span>
          <input
            type="tel"
            value={draft.phone}
            onInput={(event) => {
              setSaved(false)
              setDraft({ ...draft, phone: (event.target as HTMLInputElement).value })
            }}
            class={cn(inputClass, CONTROL)}
          />
        </label>
      </div>

      <label class="mt-3 block max-w-[42rem]">
        <span class={cn('mb-1 block font-medium text-content-muted', TEXT_XS)}>Notes</span>
        <textarea
          rows={3}
          value={draft.notes}
          onInput={(event) => {
            setSaved(false)
            setDraft({ ...draft, notes: (event.target as HTMLTextAreaElement).value })
          }}
          class={cn(inputClass, 'py-2')}
        />
      </label>

      {error && (
        <p role="alert" class={cn('mt-2.5 bg-danger-soft px-2.5 py-1.5 text-danger', RADIUS, TEXT_XS)}>
          {error}
        </p>
      )}

      <div class="mt-3 flex items-center gap-2.5">
        <button
          type="submit"
          class={cn(
            'bg-accent px-3 font-semibold text-accent-content hover:brightness-110',
            CONTROL,
            RADIUS,
            TEXT_SM,
          )}
        >
          Save
        </button>
        {saved && <span class={cn('text-success', TEXT_XS)}>Saved</span>}
        {client.created_at && (
          <span class={cn('ml-auto text-content-subtle', TEXT_XS)}>
            Client since {formatDate(client.created_at.slice(0, 10))}
          </span>
        )}
      </div>
    </form>
  )
}
