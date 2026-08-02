/**
 * New and edit order form (Phase 1 step 5).
 *
 * One component for both, because the fields are identical and keeping two
 * copies in step is a losing game. `/orders/new` creates,
 * `/orders/:id/edit` updates.
 *
 * The save button is pinned to the bottom rather than sitting at the end of
 * the form: on a phone with the keyboard up, a button below six fields is
 * two scrolls away from wherever you are typing.
 */
import { useEffect, useMemo, useState } from 'preact/hooks'
import { useLocation, useRoute } from 'preact-iso'
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Input,
  Screen,
  Segmented,
  Select,
  Textarea,
} from '../components/ui'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { createOrder, updateOrder, type NewOrderInput } from '../db/writes'
import { ORDER_TYPES, type OrderType } from '../db/schema'
import { ORDER_TYPE_LABELS } from './orderStage'
import { addDays, today } from '../lib/dates'
import { fromMinorUnits, parseToMinor } from '../lib/money'

interface Draft {
  client_id: string
  order_type: OrderType
  item_description: string
  price_total: string
  pickup_due_date: string
  return_due_date: string
  notes: string
}

/** Fields validation can complain about. `notes` and `order_type` cannot fail. */
type FieldKey = Exclude<keyof Draft, 'notes' | 'order_type'>

/**
 * A rejection carries which field it is about, so the message can be shown
 * beside that field rather than in one note at the foot of the form -- where,
 * on a phone, it is several fields below whatever it is complaining about.
 */
interface Invalid {
  field: FieldKey
  message: string
}

const BLANK: Draft = {
  client_id: '',
  order_type: 'tailor_made',
  item_description: '',
  price_total: '',
  // A week out is the common case and saves a date-picker interaction on
  // nearly every order. Never silently wrong: the field is visible and
  // required.
  pickup_due_date: addDays(today(), 7),
  return_due_date: '',
  notes: '',
}

export function OrderForm() {
  const { params } = useRoute()
  const location = useLocation()
  const { db, shop, activeStaff } = useCurrentShop()

  const orderId = params.id
  const isEdit = Boolean(orderId)

  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id }, sort: [{ name: 'asc' }] }).$,
    [db, shop.id],
    [],
  )
  const clients = useMemo(() => clientDocs.map((doc) => doc.toJSON()), [clientDocs])

  const orderDoc = useRxQuery(
    () => (orderId ? db.orders.findOne(orderId).$ : db.orders.findOne('__none__').$),
    [db, orderId],
    null,
  )

  const [draft, setDraft] = useState<Draft>(() => ({
    ...BLANK,
    // /orders/new?client=<id> from a client's page, so taking an order for
    // someone you are already looking at does not mean finding them again.
    client_id: new URLSearchParams(location.query as Record<string, string>).get('client') ?? '',
  }))
  const [loaded, setLoaded] = useState(!isEdit)
  const [error, setError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<Invalid | null>(null)
  const [saving, setSaving] = useState(false)

  /**
   * Patch the draft and retire any complaint about a field being patched.
   *
   * Without the second half, a validation message stays on screen after the
   * user has fixed the very thing it names, which reads as the app not having
   * noticed.
   */
  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }))
    if (invalid && invalid.field in patch) setInvalid(null)
  }

  const errorFor = (field: FieldKey) => (invalid?.field === field ? invalid.message : null)

  useEffect(() => {
    if (!isEdit || loaded || !orderDoc) return
    const order = orderDoc.toJSON()
    setDraft({
      client_id: order.client_id,
      order_type: order.order_type,
      item_description: order.summary,
      price_total: String(fromMinorUnits(order.price_total_minor, order.currency)),
      pickup_due_date: order.pickup_due_date,
      return_due_date: order.return_due_date ?? '',
      notes: order.notes ?? '',
    })
    setLoaded(true)
  }, [isEdit, loaded, orderDoc])

  // The order's own snapshotted currency once one is in scope (editing);
  // otherwise the shop's, since no order exists yet to snapshot from.
  const currency = orderDoc?.toJSON().currency ?? shop.currency

  function validate(): NewOrderInput | Invalid {
    if (!draft.client_id) {
      return { field: 'client_id', message: 'Choose which client this order is for.' }
    }
    if (!draft.item_description.trim()) {
      return { field: 'item_description', message: 'Describe the item, so it can be told apart later.' }
    }

    const price = parseToMinor(draft.price_total, currency)
    if (price === null) {
      return { field: 'price_total', message: 'Enter the price as a number.' }
    }

    if (!draft.pickup_due_date) {
      return { field: 'pickup_due_date', message: 'A pickup date is needed.' }
    }
    if (draft.return_due_date && draft.return_due_date < draft.pickup_due_date) {
      return { field: 'return_due_date', message: 'The return date cannot be before the pickup date.' }
    }

    return {
      client_id: draft.client_id,
      order_type: draft.order_type,
      item_description: draft.item_description,
      price_total_minor: price,
      pickup_due_date: draft.pickup_due_date,
      ...(draft.return_due_date ? { return_due_date: draft.return_due_date } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes } : {}),
    }
  }

  async function submit(event: Event) {
    event.preventDefault()
    const result = validate()
    if ('field' in result) {
      setInvalid(result)
      return
    }
    setInvalid(null)

    setSaving(true)
    setError(null)
    try {
      if (orderId) {
        await updateOrder(db, orderId, result)
        location.route(`/orders/${orderId}`, true)
      } else {
        const created = await createOrder(db, shop.id, result, activeStaff?.id)
        location.route(`/orders/${created.id}`, true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this order.')
      setSaving(false)
    }
  }

  const backTo = orderId ? `/orders/${orderId}` : '/orders'

  if (clients.length === 0) {
    return (
      <Screen title="New order" back="/orders">
        <Card>
          <p class="text-sm text-stone-600 dark:text-stone-300">
            An order belongs to a client, and there are none yet. Add the client first.
          </p>
          <Button linkTo="/clients" block class="mt-3">
            Go to clients
          </Button>
        </Card>
      </Screen>
    )
  }

  const isRental = draft.order_type === 'rental'

  return (
    <Screen title={isEdit ? 'Edit order' : 'New order'} back={backTo}>
      <form onSubmit={submit}>
        <Card>
          <div class="space-y-4">
            <Field label="Client" error={errorFor('client_id')}>
              <Select
                value={draft.client_id}
                onChange={(e) =>
                  update({ client_id: (e.target as HTMLSelectElement).value })
                }
              >
                <option value="">Choose a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Type">
              <Segmented
                value={draft.order_type}
                options={ORDER_TYPES.map((type) => ({
                  value: type,
                  label: ORDER_TYPE_LABELS[type],
                }))}
                onChange={(order_type) => update({ order_type })}
                label="Order type"
              />
            </Field>

            <Field label="Item" hint="What is being made, rented, or sold." error={errorFor('item_description')}>
              <Input
                value={draft.item_description}
                placeholder="Navy two-piece suit"
                onInput={(e) =>
                  update({ item_description: (e.target as HTMLInputElement).value })
                }
              />
            </Field>

            <Field label="Price" hint={`Amount in ${currency}.`} error={errorFor('price_total')}>
              <Input
                inputmode="decimal"
                placeholder="0"
                value={draft.price_total}
                onInput={(e) =>
                  update({ price_total: (e.target as HTMLInputElement).value })
                }
              />
            </Field>

            <Field
              label={isRental ? 'Collection date' : 'Pickup date'}
              error={errorFor('pickup_due_date')}
            >
              <Input
                type="date"
                value={draft.pickup_due_date}
                onInput={(e) =>
                  update({ pickup_due_date: (e.target as HTMLInputElement).value })
                }
              />
            </Field>

            {isRental && (
              <Field
                label="Return date"
                hint="When the item is due back."
                error={errorFor('return_due_date')}
              >
                <Input
                  type="date"
                  min={draft.pickup_due_date}
                  value={draft.return_due_date}
                  onInput={(e) =>
                    update({ return_due_date: (e.target as HTMLInputElement).value })
                  }
                />
              </Field>
            )}

            <Field label="Notes">
              <Textarea
                value={draft.notes}
                onInput={(e) => update({ notes: (e.target as HTMLTextAreaElement).value })}
              />
            </Field>

            {/* Save failures only -- validation now speaks at the field it is about. */}
            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
        </Card>

        {/*
          Pinned to the bottom edge so it is reachable without scrolling back
          past every field.

          `bottom-0`, not `bottom-14`: the tab bar hides itself on this route
          (see TabBar.isFullScreenTask), so there is nothing beneath to clear.
          The old offset was a guess at the bar's height that stopped being
          true, and the tab bar's centre action ended up overlapping the submit
          button.
        */}
        <div
          class="fixed inset-x-0 bottom-0 z-20 bg-white px-4 pt-3 dark:bg-stone-900
                 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        >
          <div class="mx-auto flex max-w-lg gap-2">
            <Button
              variant="secondary"
              class="flex-1"
              type="button"
              onClick={() => location.route(backTo)}
            >
              Cancel
            </Button>
            <Button class="flex-2" type="submit" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create order'}
            </Button>
          </div>
        </div>
      </form>
    </Screen>
  )
}
