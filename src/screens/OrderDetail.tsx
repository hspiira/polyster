/**
 * Order detail: the most-used screen day to day (Phase 1 steps 5 and 6).
 *
 * Stage tracker, payments, running balance, and the WhatsApp button, in that
 * order because that is the order a shop needs them: where is it, what is
 * owed, tell the client.
 *
 * The balance comes from `observeBalance()`, not from the `order_balances`
 * Postgres view. RxDB replicates tables, not views, and this is precisely the
 * screen most likely to be open with no connectivity -- see ARCHITECTURE.md D9.
 */
import { useMemo, useState } from 'preact/hooks'
import { useLocation, useRoute } from 'preact-iso'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Screen,
  Select,
} from '../components/ui'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeBalance } from '../db/balances'
import { changeOrderStage, recordPayment, voidPayment } from '../db/writes'
import { PAYMENT_METHODS, type PaymentMethod } from '../db/schema'
import { formatMoney, parseMoney } from '../lib/money'
import { formatDate, formatDateTime, formatDueDate, dueBucket } from '../lib/dates'
import { balanceReminder, suggestedMessage, waLink } from '../lib/whatsapp'
import {
  ORDER_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  STAGE_LABELS,
  STAGE_TONES,
  nextStage,
  stagesFor,
} from './orderStage'

export function OrderDetail() {
  const { params } = useRoute()
  const location = useLocation()
  const orderId = params.id ?? ''
  const { db, shop, activeStaff } = useCurrentShop()

  const orderDoc = useRxQuery(() => db.orders.findOne(orderId).$, [db, orderId], null)
  const order = orderDoc?.toJSON() ?? null

  const clientDoc = useRxQuery(
    () => db.clients.findOne(order?.client_id ?? '__none__').$,
    [db, order?.client_id],
    null,
  )
  const client = clientDoc?.toJSON() ?? null

  const balance = useRxQuery(() => observeBalance(db, orderId), [db, orderId], null)

  const paymentDocs = useRxQuery(
    () =>
      db.payments.find({ selector: { order_id: orderId }, sort: [{ payment_date: 'desc' }] }).$,
    [db, orderId],
    [],
  )
  const payments = useMemo(() => paymentDocs.map((doc) => doc.toJSON()), [paymentDocs])

  const [error, setError] = useState<string | null>(null)

  if (!order) {
    return (
      <Screen title="Order">
        <EmptyState
          title="Order not found"
          description="It may have been removed, or this device has not synced it yet."
          action={
            <a href="/orders">
              <Button variant="secondary">Back to orders</Button>
            </a>
          }
        />
      </Screen>
    )
  }

  const flow = stagesFor(order.order_type)
  const upcoming = nextStage(order.order_type, order.stage)
  const stillDue = order.stage !== 'picked_up' && order.stage !== 'returned'
  const overdue = stillDue && dueBucket(order.pickup_due_date) === 'overdue'

  async function advance(): Promise<void> {
    if (!upcoming) return
    setError(null)
    try {
      await changeOrderStage(db, orderId, upcoming, activeStaff?.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the stage.')
    }
  }

  return (
    <Screen
      title={order.item_description}
      action={
        <Button variant="ghost" class="px-2" onClick={() => location.route(`/orders/${orderId}/edit`)}>
          Edit
        </Button>
      }
    >
      <div class="space-y-4">
        <Card>
          <dl class="space-y-1 text-sm">
            <Row label="Client">
              {client ? (
                <a href={`/clients/${client.id}`} class="text-gray-900 underline">
                  {client.name}
                </a>
              ) : (
                <span class="text-gray-400">Unknown</span>
              )}
            </Row>
            <Row label="Type">{ORDER_TYPE_LABELS[order.order_type]}</Row>
            <Row label={order.order_type === 'rental' ? 'Collection' : 'Pickup'}>
              <span class={overdue ? 'text-red-600' : undefined}>
                {formatDate(order.pickup_due_date)} ({formatDueDate(order.pickup_due_date)})
              </span>
            </Row>
            {order.return_due_date && (
              <Row label="Return due">{formatDate(order.return_due_date)}</Row>
            )}
          </dl>
          {order.notes && (
            <p class="mt-3 whitespace-pre-wrap border-t border-gray-100 pt-3 text-sm text-gray-600">
              {order.notes}
            </p>
          )}
        </Card>

        {error && <ErrorNote>{error}</ErrorNote>}

        <Card>
          <h2 class="mb-3 font-medium text-gray-900">Stage</h2>
          <ol class="flex flex-wrap gap-2">
            {flow.map((stage) => {
              const reached = flow.indexOf(stage) <= flow.indexOf(order.stage)
              return (
                <li key={stage}>
                  <Chip tone={reached ? STAGE_TONES[stage] : 'neutral'}>
                    {reached ? '✓ ' : ''}
                    {STAGE_LABELS[stage]}
                  </Chip>
                </li>
              )
            })}
          </ol>

          {upcoming ? (
            <Button class="mt-4 w-full" onClick={() => void advance()}>
              Mark {STAGE_LABELS[upcoming].toLowerCase()}
            </Button>
          ) : (
            <p class="mt-4 text-sm text-gray-500">This order is finished.</p>
          )}
        </Card>

        <PaymentsCard
          orderId={orderId}
          balance={balance}
          payments={payments}
          onError={setError}
        />

        {client && balance && (
          <WhatsAppCard
            shopName={shop.name}
            clientName={client.name}
            phone={client.phone}
            order={order}
            balance={balance}
            overdue={overdue}
          />
        )}

        <StageHistory orderId={orderId} />
      </div>
    </Screen>
  )
}

function Row({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div class="flex justify-between gap-4">
      <dt class="text-gray-500">{label}</dt>
      <dd class="text-right text-gray-900">{children}</dd>
    </div>
  )
}

function PaymentsCard({
  orderId,
  balance,
  payments,
  onError,
}: {
  orderId: string
  balance: import('../db/balances').OrderBalance | null
  payments: import('../db/schema').PaymentDoc[]
  onError: (message: string | null) => void
}) {
  const { db, activeStaff } = useCurrentShop()
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function submit(event: Event) {
    event.preventDefault()
    const parsed = parseMoney(amount)
    if (parsed === null || parsed <= 0) {
      setFormError('Enter an amount greater than zero.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      await recordPayment(db, orderId, { amount: parsed, method, notes }, activeStaff?.id)
      setAmount('')
      setNotes('')
      setAdding(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not record this payment.')
    } finally {
      setSaving(false)
    }
  }

  async function voidOne(paymentId: string) {
    onError(null)
    try {
      await voidPayment(db, paymentId)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not void that payment.')
    }
  }

  return (
    <Card>
      <div class="flex items-baseline justify-between">
        <h2 class="font-medium text-gray-900">Payments</h2>
        {balance && (
          <span class={`text-lg font-semibold ${balance.balance > 0 ? 'text-amber-700' : 'text-green-700'}`}>
            {balance.balance > 0 ? `${formatMoney(balance.balance)} due` : 'Fully paid'}
          </span>
        )}
      </div>

      {balance && (
        <p class="mt-1 text-sm text-gray-500">
          {formatMoney(balance.amount_paid)} paid of {formatMoney(balance.price_total)}
          {balance.balance < 0 && ` · overpaid by ${formatMoney(-balance.balance)}`}
        </p>
      )}

      {payments.length > 0 && (
        <ul class="mt-3 divide-y divide-gray-100 border-t border-gray-100">
          {payments.map((payment) => (
            <li key={payment.id} class="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span class="block text-gray-900">{formatMoney(payment.amount)}</span>
                <span class="block text-xs text-gray-500">
                  {PAYMENT_METHOD_LABELS[payment.method]} · {formatDateTime(payment.payment_date)}
                </span>
                {payment.notes && <span class="block text-xs text-gray-500">{payment.notes}</span>}
              </span>
              <Button variant="ghost" class="px-2 text-xs" onClick={() => void voidOne(payment.id)}>
                Void
              </Button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form onSubmit={submit} class="mt-3 space-y-3 border-t border-gray-100 pt-3">
          <Field label="Amount">
            <Input
              inputmode="decimal"
              autofocus
              value={amount}
              onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
            />
          </Field>
          <Field label="Method">
            <Select
              value={method}
              onChange={(e) => setMethod((e.target as HTMLSelectElement).value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes">
            <Input value={notes} onInput={(e) => setNotes((e.target as HTMLInputElement).value)} />
          </Field>

          {formError && <ErrorNote>{formError}</ErrorNote>}

          <div class="flex gap-2">
            <Button variant="secondary" class="flex-1" type="button" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button class="flex-1" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Record payment'}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" class="mt-3 w-full" onClick={() => setAdding(true)}>
          Add payment
        </Button>
      )}
    </Card>
  )
}

/**
 * The wa.me button (Phase 1 step 6, ARCHITECTURE.md D6).
 *
 * Opens WhatsApp with a message already written. The shop reads it and taps
 * send -- nothing is sent on their behalf, which is the whole point of picking
 * links over the Cloud API for v1.
 */
function WhatsAppCard({
  shopName,
  clientName,
  phone,
  order,
  balance,
  overdue,
}: {
  shopName: string
  clientName: string
  phone: string | undefined
  order: import('../db/schema').OrderDoc
  balance: import('../db/balances').OrderBalance
  overdue: boolean
}) {
  const context = { shopName, clientName, order, balance }
  const statusLink = waLink(phone, suggestedMessage(context))
  const reminderLink = waLink(phone, balanceReminder(context))
  const showReminder = overdue && balance.balance > 0 && reminderLink

  if (!statusLink) {
    return (
      <Card>
        <h2 class="font-medium text-gray-900">Message client</h2>
        <p class="mt-1 text-sm text-gray-600">
          {phone
            ? `"${phone}" is not a number WhatsApp will accept. Add the country code, or start it with 0.`
            : 'No phone number saved for this client.'}
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <h2 class="font-medium text-gray-900">Message client</h2>
      <p class="mt-1 text-sm text-gray-500">
        Opens WhatsApp with the message ready. Nothing is sent until you tap send.
      </p>
      <div class="mt-3 space-y-2">
        <a href={statusLink} target="_blank" rel="noreferrer" class="block">
          <Button class="w-full">Send {STAGE_LABELS[order.stage].toLowerCase()} update</Button>
        </a>
        {showReminder && (
          <a href={reminderLink} target="_blank" rel="noreferrer" class="block">
            <Button variant="secondary" class="w-full">
              Send balance reminder
            </Button>
          </a>
        )}
      </div>
    </Card>
  )
}

function StageHistory({ orderId }: { orderId: string }) {
  const { db, staff } = useCurrentShop()

  const historyDocs = useRxQuery(
    () =>
      db.order_stage_history.find({
        selector: { order_id: orderId },
        sort: [{ changed_at: 'desc' }],
      }).$,
    [db, orderId],
    [],
  )

  const names = useMemo(() => new Map(staff.map((member) => [member.id, member.name])), [staff])
  const history = useMemo(() => historyDocs.map((doc) => doc.toJSON()), [historyDocs])

  if (history.length === 0) return null

  return (
    <Card>
      <h2 class="font-medium text-gray-900">History</h2>
      <ul class="mt-2 space-y-1 text-sm text-gray-600">
        {history.map((entry) => (
          <li key={entry.id}>
            {STAGE_LABELS[entry.to_stage]}
            {entry.changed_by && names.has(entry.changed_by) && ` by ${names.get(entry.changed_by)}`}
            {' · '}
            <span class="text-gray-500">{formatDateTime(entry.changed_at)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
