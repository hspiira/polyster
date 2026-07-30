/**
 * New and edit order form (Phase 1 step 5).
 *
 * One component for both because the fields are identical and keeping two
 * copies in step is a losing game. `/orders/new` creates, `/orders/:id/edit`
 * updates.
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
  Select,
  Textarea,
} from '../components/ui'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { createOrder, updateOrder, type NewOrderInput } from '../db/writes'
import { ORDER_TYPES, type OrderType } from '../db/schema'
import { ORDER_TYPE_LABELS } from './orderStage'
import { addDays, today } from '../lib/dates'
import { parseMoney } from '../lib/money'

interface Draft {
  client_id: string
  order_type: OrderType
  item_description: string
  price_total: string
  pickup_due_date: string
  return_due_date: string
  notes: string
}

const BLANK: Draft = {
  client_id: '',
  order_type: 'tailor_made',
  item_description: '',
  price_total: '',
  // A week out is the common case and saves a date-picker interaction on
  // nearly every order. Easy to change, and never silently wrong -- the field
  // is visible and required.
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
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isEdit || loaded || !orderDoc) return
    const order = orderDoc.toJSON()
    setDraft({
      client_id: order.client_id,
      order_type: order.order_type,
      item_description: order.item_description,
      price_total: String(order.price_total),
      pickup_due_date: order.pickup_due_date,
      return_due_date: order.return_due_date ?? '',
      notes: order.notes ?? '',
    })
    setLoaded(true)
  }, [isEdit, loaded, orderDoc])

  function validate(): NewOrderInput | string {
    if (!draft.client_id) return 'Choose which client this order is for.'
    if (!draft.item_description.trim()) return 'Describe the item, so it can be told apart later.'

    const price = parseMoney(draft.price_total)
    if (price === null) return 'Enter the price as a number.'

    if (!draft.pickup_due_date) return 'A pickup date is needed.'
    if (draft.return_due_date && draft.return_due_date < draft.pickup_due_date) {
      return 'The return date cannot be before the pickup date.'
    }

    return {
      client_id: draft.client_id,
      order_type: draft.order_type,
      item_description: draft.item_description,
      price_total: price,
      pickup_due_date: draft.pickup_due_date,
      ...(draft.return_due_date ? { return_due_date: draft.return_due_date } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes } : {}),
    }
  }

  async function submit(event: Event) {
    event.preventDefault()
    const result = validate()
    if (typeof result === 'string') {
      setError(result)
      return
    }

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

  if (clients.length === 0) {
    return (
      <Screen title={isEdit ? 'Edit order' : 'New order'}>
        <Card>
          <p class="text-sm text-gray-600">
            An order belongs to a client, and there are none yet. Add the client first.
          </p>
          <a href="/clients" class="mt-3 block">
            <Button class="w-full">Go to clients</Button>
          </a>
        </Card>
      </Screen>
    )
  }

  const isRental = draft.order_type === 'rental'

  return (
    <Screen title={isEdit ? 'Edit order' : 'New order'}>
      <Card>
        <form onSubmit={submit} class="space-y-3">
          <Field label="Client">
            <Select
              value={draft.client_id}
              onChange={(e) => setDraft({ ...draft, client_id: (e.target as HTMLSelectElement).value })}
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
            <Select
              value={draft.order_type}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  order_type: (e.target as HTMLSelectElement).value as OrderType,
                })
              }
            >
              {ORDER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ORDER_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Item" hint="What is being made, rented, or sold.">
            <Input
              value={draft.item_description}
              onInput={(e) =>
                setDraft({ ...draft, item_description: (e.target as HTMLInputElement).value })
              }
            />
          </Field>

          <Field label="Price">
            <Input
              inputmode="decimal"
              value={draft.price_total}
              onInput={(e) => setDraft({ ...draft, price_total: (e.target as HTMLInputElement).value })}
            />
          </Field>

          <Field label={isRental ? 'Collection date' : 'Pickup date'}>
            <Input
              type="date"
              value={draft.pickup_due_date}
              onInput={(e) =>
                setDraft({ ...draft, pickup_due_date: (e.target as HTMLInputElement).value })
              }
            />
          </Field>

          {isRental && (
            <Field label="Return date" hint="When the item is due back.">
              <Input
                type="date"
                min={draft.pickup_due_date}
                value={draft.return_due_date}
                onInput={(e) =>
                  setDraft({ ...draft, return_due_date: (e.target as HTMLInputElement).value })
                }
              />
            </Field>
          )}

          <Field label="Notes">
            <Textarea
              value={draft.notes}
              onInput={(e) => setDraft({ ...draft, notes: (e.target as HTMLTextAreaElement).value })}
            />
          </Field>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div class="flex gap-2">
            <Button
              variant="secondary"
              class="flex-1"
              type="button"
              onClick={() => location.route(orderId ? `/orders/${orderId}` : '/orders')}
            >
              Cancel
            </Button>
            <Button class="flex-1" type="submit" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create order'}
            </Button>
          </div>
        </form>
      </Card>
    </Screen>
  )
}
