/**
 * Order detail: the most-used screen day to day (Phase 1 steps 5 and 6).
 *
 * Ordered the way a shop needs it: where is it, what is owed, tell the client.
 * The balance is the largest thing on the screen after the item name, because
 * it is the question asked at the counter.
 *
 * The balance comes from `observeBalance()`, not the `order_balances` Postgres
 * view. RxDB replicates tables, not views, and this is exactly the screen most
 * likely to be open with no connectivity -- ARCHITECTURE.md D9.
 */
import { useMemo, useState } from 'preact/hooks'
import { useLocation, useRoute } from 'preact-iso'
import {
  Button,
  Card,
  DataRow,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
} from '../components/ui'
import {
  IconAlert,
  IconCheck,
  IconEdit,
  IconOrders,
  IconPlus,
  IconWhatsApp,
} from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { observeBalance, type OrderBalance } from '../db/balances'
import { changeOrderStage, recordPayment, voidPayment } from '../db/writes'
import { PAYMENT_METHODS, type OrderDoc, type PaymentDoc, type PaymentMethod } from '../db/schema'
import { formatMoney, parseMoney } from '../lib/money'
import { dueBucket, formatDate, formatDateTime, formatDueDate } from '../lib/dates'
import { balanceReminder, suggestedMessage, waLink } from '../lib/whatsapp'
import {
  ORDER_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  STAGE_LABELS,
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
    () => db.payments.find({ selector: { order_id: orderId }, sort: [{ payment_date: 'desc' }] }).$,
    [db, orderId],
    [],
  )
  const payments = useMemo(() => paymentDocs.map((doc) => doc.toJSON()), [paymentDocs])

  const [error, setError] = useState<string | null>(null)

  if (!order) {
    return (
      <Screen title="Order" back="/orders">
        <Card padded={false}>
          <EmptyState
            icon={<IconOrders size={26} />}
            title="Order not found"
            description="It may have been removed, or this device has not synced it yet."
            action={
              <a href="/orders">
                <Button variant="secondary">Back to orders</Button>
              </a>
            }
          />
        </Card>
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
      subtitle={client?.name}
      back="/orders"
      action={
        <Button
          variant="ghost"
          size="sm"
          aria-label="Edit order"
          onClick={() => location.route(`/orders/${orderId}/edit`)}
        >
          <IconEdit size={20} />
        </Button>
      }
    >
      <div class="space-y-5">
        {error && <ErrorNote>{error}</ErrorNote>}

        <BalanceCard balance={balance} />

        <section>
          <SectionTitle>Progress</SectionTitle>
          <Card>
            <StageTrack flow={flow} current={order.stage} />
            {upcoming ? (
              <Button block class="mt-4" onClick={() => void advance()}>
                <IconCheck size={18} /> Mark {STAGE_LABELS[upcoming].toLowerCase()}
              </Button>
            ) : (
              <p class="mt-4 flex items-center justify-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <IconCheck size={16} /> This order is finished
              </p>
            )}
          </Card>
        </section>

        <section>
          <SectionTitle>Details</SectionTitle>
          <Card>
            <dl>
              <DataRow label="Client">
                {client ? (
                  <a href={`/clients/${client.id}`} class="text-brand-700 dark:text-brand-400">
                    {client.name}
                  </a>
                ) : (
                  <span class="text-stone-400">Unknown</span>
                )}
              </DataRow>
              <DataRow label="Type">{ORDER_TYPE_LABELS[order.order_type]}</DataRow>
              <DataRow label={order.order_type === 'rental' ? 'Collection' : 'Pickup'}>
                <span class={overdue ? 'text-red-600 dark:text-red-400' : ''}>
                  {formatDate(order.pickup_due_date)}
                  <span class="ml-1 font-normal text-stone-500 dark:text-stone-400">
                    ({formatDueDate(order.pickup_due_date)})
                  </span>
                </span>
              </DataRow>
              {order.return_due_date && (
                <DataRow label="Return due">{formatDate(order.return_due_date)}</DataRow>
              )}
            </dl>
            {order.notes && (
              <p class="mt-3 whitespace-pre-wrap border-t border-stone-100 pt-3 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-300">
                {order.notes}
              </p>
            )}
          </Card>
        </section>

        <PaymentsSection
          orderId={orderId}
          balance={balance}
          payments={payments}
          onError={setError}
        />

        {client && balance && (
          <WhatsAppSection
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

/** The answer to the question asked at the counter, sized accordingly. */
function BalanceCard({ balance }: { balance: OrderBalance | null }) {
  if (!balance) return <Card><div class="h-16" /></Card>

  const owing = balance.balance > 0
  const overpaid = balance.balance < 0

  return (
    <div
      class={`rounded-card p-5 text-white shadow-raised ${
        owing
          ? 'bg-linear-to-br from-amber-600 to-amber-700'
          : 'bg-linear-to-br from-emerald-600 to-emerald-700'
      }`}
    >
      <p class="text-xs font-medium uppercase tracking-wider opacity-80">
        {owing ? 'Balance due' : overpaid ? 'Overpaid' : 'Fully paid'}
      </p>
      <p class="mt-1 text-3xl font-semibold tracking-tight">
        {owing ? formatMoney(balance.balance) : formatMoney(Math.abs(balance.balance))}
      </p>
      <p class="mt-1.5 text-sm opacity-90">
        {formatMoney(balance.amount_paid)} paid of {formatMoney(balance.price_total)}
      </p>
      <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-white/25">
        <div
          class="h-full rounded-full bg-white transition-[width] duration-500"
          style={{
            width: `${Math.min(100, Math.max(0, (balance.amount_paid / (balance.price_total || 1)) * 100))}%`,
          }}
        />
      </div>
    </div>
  )
}

/** Connected dots rather than loose chips, so the sequence reads as a path. */
function StageTrack({
  flow,
  current,
}: {
  flow: readonly import('../db/schema').OrderStage[]
  current: import('../db/schema').OrderStage
}) {
  const currentIndex = flow.indexOf(current)

  return (
    <ol class="flex items-start">
      {flow.map((stage, index) => {
        const done = index < currentIndex
        const active = index === currentIndex
        return (
          <li key={stage} class="flex flex-1 flex-col items-center">
            <div class="flex w-full items-center">
              <span
                class={`h-0.5 flex-1 ${index === 0 ? 'opacity-0' : ''} ${
                  index <= currentIndex ? 'bg-brand-600' : 'bg-stone-200 dark:bg-stone-700'
                }`}
              />
              <span
                class={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs
                        font-semibold transition-colors ${
                          done
                            ? 'bg-brand-600 text-white'
                            : active
                              ? 'bg-brand-700 text-white ring-4 ring-brand-600/20'
                              : 'bg-stone-200 text-stone-500 dark:bg-stone-700 dark:text-stone-400'
                        }`}
              >
                {done ? <IconCheck size={14} /> : index + 1}
              </span>
              <span
                class={`h-0.5 flex-1 ${index === flow.length - 1 ? 'opacity-0' : ''} ${
                  index < currentIndex ? 'bg-brand-600' : 'bg-stone-200 dark:bg-stone-700'
                }`}
              />
            </div>
            <span
              class={`mt-1.5 px-0.5 text-center text-[11px] leading-tight ${
                active
                  ? 'font-semibold text-stone-900 dark:text-stone-100'
                  : 'text-stone-500 dark:text-stone-400'
              }`}
            >
              {STAGE_LABELS[stage]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function PaymentsSection({
  orderId,
  balance,
  payments,
  onError,
}: {
  orderId: string
  balance: OrderBalance | null
  payments: PaymentDoc[]
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

  return (
    <section>
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => setAdding(true)}
            class="flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-400"
          >
            <IconPlus size={14} /> Add
          </button>
        }
      >
        Payments
      </SectionTitle>

      <Card padded={payments.length === 0}>
        {payments.length === 0 ? (
          <p class="text-center text-sm text-stone-500 dark:text-stone-400">
            No payments recorded yet.
          </p>
        ) : (
          <ul class="divide-y divide-stone-100 dark:divide-stone-800">
            {payments.map((payment) => (
              <li key={payment.id} class="flex items-center justify-between gap-3 px-4 py-3">
                <span class="min-w-0">
                  <span class="block font-medium">{formatMoney(payment.amount)}</span>
                  <span class="block truncate text-xs text-stone-500 dark:text-stone-400">
                    {PAYMENT_METHOD_LABELS[payment.method]} · {formatDateTime(payment.payment_date)}
                  </span>
                  {payment.notes && (
                    <span class="block truncate text-xs text-stone-500 dark:text-stone-400">
                      {payment.notes}
                    </span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onError(null)
                    void voidPayment(db, payment.id).catch((err: unknown) =>
                      onError(err instanceof Error ? err.message : 'Could not void that payment.'),
                    )
                  }}
                >
                  Void
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet open={adding} title="Record a payment" onClose={() => setAdding(false)}>
        <form onSubmit={submit} class="space-y-4">
          {balance && balance.balance > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(balance.balance))}
              class="w-full rounded-control border border-dashed border-brand-400
                     bg-brand-50 px-3 py-2.5 text-sm text-brand-800 dark:border-brand-700
                     dark:bg-brand-950 dark:text-brand-300"
            >
              Pay the full balance, {formatMoney(balance.balance)}
            </button>
          )}

          <Field label="Amount">
            <Input
              inputmode="decimal"
              autofocus
              value={amount}
              onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
            />
          </Field>

          <Field label="Method">
            <Segmented
              value={method}
              options={PAYMENT_METHODS.map((value) => ({
                value,
                label: PAYMENT_METHOD_LABELS[value],
              }))}
              onChange={setMethod}
              label="Payment method"
            />
          </Field>

          <Field label="Notes">
            <Input value={notes} onInput={(e) => setNotes((e.target as HTMLInputElement).value)} />
          </Field>

          {formError && <ErrorNote>{formError}</ErrorNote>}

          <div class="flex gap-2 pt-1">
            <Button variant="secondary" class="flex-1" type="button" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button class="flex-1" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Record payment'}
            </Button>
          </div>
        </form>
      </Sheet>
    </section>
  )
}

/**
 * The wa.me button (Phase 1 step 6, ARCHITECTURE.md D6).
 *
 * Opens WhatsApp with the message already written. Nothing is sent on the
 * shop's behalf, which is the whole point of choosing links over the Cloud API
 * for v1 -- so the button says so.
 */
function WhatsAppSection({
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
  order: OrderDoc
  balance: OrderBalance
  overdue: boolean
}) {
  const context = { shopName, clientName, order, balance }
  const statusLink = waLink(phone, suggestedMessage(context))
  const reminderLink = waLink(phone, balanceReminder(context))
  const showReminder = overdue && balance.balance > 0 && reminderLink

  if (!statusLink) {
    return (
      <section>
        <SectionTitle>Message client</SectionTitle>
        <Card>
          <p class="flex gap-2 text-sm text-stone-600 dark:text-stone-300">
            <IconAlert size={18} class="mt-0.5 shrink-0 text-stone-400" />
            {phone
              ? `"${phone}" is not a number WhatsApp will accept. Add the country code, or start it with 0.`
              : 'No phone number saved for this client.'}
          </p>
        </Card>
      </section>
    )
  }

  return (
    <section>
      <SectionTitle>Message client</SectionTitle>
      <Card>
        <p class="mb-3 text-sm text-stone-500 dark:text-stone-400">
          Opens WhatsApp with the message ready. Nothing is sent until you tap send.
        </p>
        <div class="space-y-2">
          <a href={statusLink} target="_blank" rel="noreferrer" class="block">
            <Button block>
              <IconWhatsApp size={18} /> Send {STAGE_LABELS[order.stage].toLowerCase()} update
            </Button>
          </a>
          {showReminder && (
            <a href={reminderLink} target="_blank" rel="noreferrer" class="block">
              <Button variant="secondary" block>
                Send balance reminder
              </Button>
            </a>
          )}
        </div>
      </Card>
    </section>
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
    <section>
      <SectionTitle>History</SectionTitle>
      <Card>
        <ol class="space-y-3">
          {history.map((entry) => (
            <li key={entry.id} class="flex gap-3">
              <span class="mt-1.5 size-2 shrink-0 rounded-full bg-stone-300 dark:bg-stone-600" />
              <span class="min-w-0 text-sm">
                <span class="block">
                  {STAGE_LABELS[entry.to_stage]}
                  {entry.changed_by && names.has(entry.changed_by) && (
                    <span class="text-stone-500 dark:text-stone-400">
                      {' '}
                      by {names.get(entry.changed_by)}
                    </span>
                  )}
                </span>
                <span class="block text-xs text-stone-500 dark:text-stone-400">
                  {formatDateTime(entry.changed_at)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  )
}
