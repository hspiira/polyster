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
  cn,
  DataRow,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Screen,
  SectionTitle,
  StatStrip,
  StatTile,
  Segmented,
  Sheet,
} from '../components/ui'
import {
  IconAlert,
  IconCheck,
  IconEdit,
  IconPlus,
  IconWhatsApp,
} from '../components/icons'
import { IllustrationSearch } from '../components/illustrations'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { usePermission } from '../hooks/usePermission'
import { observeBalance, type OrderBalance } from '../db/balances'
import {
  changeOrderStage,
  logMessage,
  recordPayment,
  refundDeposit,
  setUnitDone,
  voidPayment,
} from '../db/writes'
import {
  PAYMENT_METHODS,
  type MessageTemplate,
  type OrderDoc,
  type PaymentDoc,
  type PaymentMethod,
  type StaffDoc,
} from '../db/schema'
import { formatMinor, fromMinorUnits, parseToMinor } from '../lib/money'
import { outstandingMinor, paymentDateError, paymentError } from '../lib/payments'
import { dueBucket, formatDate, formatDateTime, formatDueDate, today } from '../lib/dates'
import { balanceReminder, suggestedMessage, waLink } from '../lib/whatsapp'
import {
  CUSTOMER_TYPE_LABELS,
  ORDER_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  STAGE_LABELS,
  nextStage,
  stagesFor,
} from './orderStage'
import { useBack } from '../hooks/useBack'

export function OrderDetail() {
  const back = useBack()
  const { params } = useRoute()
  const location = useLocation()
  const orderId = params.id ?? ''
  const { db, shop, activeStaff } = useCurrentShop()
  const canEdit = usePermission('orders.edit')

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
      <Screen title="Order" back={back}>
        <EmptyState
          spacious
          illustration={<IllustrationSearch size={112} />}
          title="Order not found"
          description="It may have been removed, or this device has not synced it yet."
          action={
            <Button linkTo="/orders" variant="secondary">
              Back to orders
            </Button>
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
      title={order.summary}
      subtitle={client?.name}
      back={back}
      wide
      action={
        canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Edit order"
            onClick={() => location.route(`/orders/${orderId}/edit`)}
          >
            <IconEdit size={20} />
          </Button>
        ) : undefined
      }
    >
      <div class="space-y-5">
        {error && <ErrorNote>{error}</ErrorNote>}

        {/* Below lg the balance is one big card, because it is the question
            asked at the counter and the screen has room for nothing else.
            Above lg it becomes a strip alongside the other two figures worth
            knowing at a glance, and the room that frees goes to two columns. */}
        <div class="lg:hidden">
          <BalanceCard balance={balance} currency={order.currency} />
        </div>
        {balance && (
          <div class="hidden lg:block">
            <StatStrip>
              <StatTile label="Balance due" tone={balance.balance_minor > 0 ? 'money' : undefined}>
                {formatMinor(Math.abs(balance.balance_minor), order.currency)}
              </StatTile>
              <StatTile label="Paid">
                {formatMinor(balance.amount_paid_minor, order.currency)}
              </StatTile>
              <StatTile label={order.order_type === 'rental' ? 'Collection' : 'Pickup'} tone={overdue ? 'alert' : undefined}>
                {formatDate(order.pickup_due_date)}
              </StatTile>
            </StatStrip>
          </div>
        )}

      <div class="space-y-5 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start lg:gap-5 lg:space-y-0">
        <div class="space-y-5">
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

        <MoneyBlock order={order} balance={balance} currency={order.currency} onError={setError} />

        <ItemsSection orderId={orderId} currency={order.currency} onError={setError} />

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
              {order.expected_fulfilment_date && (
                <DataRow label="Expected fulfilment">{formatDate(order.expected_fulfilment_date)}</DataRow>
              )}
              {order.customer_type === 'corporate' && (
                <>
                  <DataRow label="Customer">{CUSTOMER_TYPE_LABELS.corporate}</DataRow>
                  {order.organisation_name && <DataRow label="Company">{order.organisation_name}</DataRow>}
                  {order.purchase_order_reference && (
                    <DataRow label="PO reference">{order.purchase_order_reference}</DataRow>
                  )}
                  {order.contact_person && (
                    <DataRow label="Contact person">{order.contact_person}</DataRow>
                  )}
                </>
              )}
            </dl>
            {order.notes && (
              <p class="mt-4 whitespace-pre-wrap text-sm text-stone-600 dark:text-stone-300">
                {order.notes}
              </p>
            )}
          </Card>
        </section>

        <PaymentsSection
          orderId={orderId}
          currency={order.currency}
          balance={balance}
          payments={payments}
          onError={setError}
        />

        </div>

        {/* Right column on desktop. On mobile these simply follow the left
            column's sections, which preserves the original running order:
            messaging the client stays above the history log, not below it. */}
        <div class="space-y-5 lg:sticky lg:top-4">
        {client && balance && (
          <WhatsAppSection
            shopName={shop.name}
            clientName={client.name}
            clientId={client.id}
            orderId={orderId}
            phone={client.phone}
            order={order}
            balance={balance}
            overdue={overdue}
          />
        )}

        <StageHistory orderId={orderId} />
        </div>
      </div>
      </div>
    </Screen>
  )
}

/**
 * The answer to the question asked at the counter, sized accordingly.
 *
 * A plain surface with one large figure, not a saturated gradient panel. The
 * amount carries the colour -- amber for outstanding, which is the one thing
 * amber is reserved for -- and the card carries none.
 */
function BalanceCard({
  balance,
  currency,
}: {
  balance: OrderBalance | null
  currency: string
}) {
  if (!balance) return <Card><div class="h-20" /></Card>

  const owing = balance.balance_minor > 0
  const overpaid = balance.balance_minor < 0
  const paidFraction = Math.min(
    1,
    Math.max(0, balance.amount_paid_minor / (balance.price_total_minor || 1)),
  )

  return (
    <Card>
      {/* Uppercase and small, then the figure very large: the label is read
          once and the number is read across a counter. */}
      <p class="text-[11px] font-semibold uppercase tracking-[0.05em] text-content-subtle">
        {owing ? 'Balance due' : overpaid ? 'Overpaid' : 'Fully paid'}
      </p>
      <p
        class={`mt-1 text-[34px] font-semibold leading-none tracking-tight tabular-nums ${
          owing ? 'text-money' : 'text-content'
        }`}
      >
        {formatMinor(Math.abs(balance.balance_minor), currency)}
      </p>
      <p class="mt-1.5 text-[13px] text-content-muted">
        {formatMinor(balance.amount_paid_minor, currency)} paid of{' '}
        {formatMinor(balance.price_total_minor, currency)}
      </p>
      <div class="mt-3 h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
        <div
          class={`h-full rounded-full transition-[width] duration-500 ${
            owing ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${paidFraction * 100}%` }}
        />
      </div>
    </Card>
  )
}

/**
 * Subtotal, adjustment, total, paid and balance as separate lines (Task 10).
 * A rental deposit is held rather than earned, so it is shown apart from the
 * balance and never folded into any of the figures above it.
 */
function MoneyBlock({
  order,
  balance,
  currency,
  onError,
}: {
  order: OrderDoc
  balance: OrderBalance | null
  currency: string
  onError: (message: string | null) => void
}) {
  const { db } = useCurrentShop()
  const canRefund = usePermission('payments.refund')
  const [refunding, setRefunding] = useState(false)

  if (!balance) return null

  const subtotal = order.price_total_minor - order.price_adjustment_minor
  const adjustment = order.price_adjustment_minor

  async function refund() {
    setRefunding(true)
    onError(null)
    try {
      await refundDeposit(db, order.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not refund this deposit.')
    } finally {
      setRefunding(false)
    }
  }

  return (
    <section>
      <SectionTitle>Money</SectionTitle>
      <Card>
        <dl>
          <DataRow label="Subtotal">{formatMinor(subtotal, currency)}</DataRow>
          {adjustment !== 0 && (
            <DataRow label={order.adjustment_reason ?? (adjustment < 0 ? 'Discount' : 'Extra charge')}>
              {adjustment < 0 ? '-' : '+'}
              {formatMinor(Math.abs(adjustment), currency)}
            </DataRow>
          )}
          <DataRow label="Total">{formatMinor(order.price_total_minor, currency)}</DataRow>
          <DataRow label="Paid">{formatMinor(balance.amount_paid_minor, currency)}</DataRow>
          <DataRow label="Balance">{formatMinor(balance.balance_minor, currency)}</DataRow>
        </dl>
        {order.rental_deposit_minor > 0 && (
          <div class="mt-3 border-t border-stone-100 pt-3 dark:border-stone-800">
            <p class="text-sm text-stone-600 dark:text-stone-300">
              Deposit held: <span class="font-medium">{formatMinor(order.rental_deposit_minor, currency)}</span>
              {order.deposit_refunded_at
                ? ` -- refunded ${formatDateTime(order.deposit_refunded_at)}`
                : ' -- held, not part of the balance above'}
            </p>
            {!order.deposit_refunded_at && canRefund && (
              <Button
                variant="secondary"
                size="sm"
                class="mt-2"
                onClick={() => void refund()}
                disabled={refunding}
              >
                {refunding ? 'Refunding...' : 'Refund deposit'}
              </Button>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}

/** The unit list, with a per-unit done tick (Task 10). */
function ItemsSection({
  orderId,
  currency,
  onError,
}: {
  orderId: string
  currency: string
  onError: (message: string | null) => void
}) {
  const { db } = useCurrentShop()
  const unitDocs = useRxQuery(
    () => db.order_units.find({ selector: { order_id: orderId }, sort: [{ position: 'asc' }] }).$,
    [db, orderId],
    [],
  )
  const units = useMemo(() => unitDocs.map((doc) => doc.toJSON()), [unitDocs])

  if (units.length === 0) return null

  async function toggle(unitId: string, done: boolean): Promise<void> {
    onError(null)
    try {
      await setUnitDone(db, unitId, done)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not update that item.')
    }
  }

  return (
    <section>
      <SectionTitle>Items</SectionTitle>
      <Card padded={false}>
        <ul>
          {units.map((unit) => (
            <li key={unit.id} class="flex items-center gap-3 px-4 py-3.5">
              <button
                type="button"
                aria-pressed={unit.done}
                aria-label={unit.done ? `Mark ${unit.item_description} not done` : `Mark ${unit.item_description} done`}
                onClick={() => void toggle(unit.id, !unit.done)}
                class={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full transition-colors',
                  unit.done
                    ? 'bg-brand-600 text-white'
                    : 'bg-stone-200 text-transparent dark:bg-stone-700',
                )}
              >
                <IconCheck size={14} />
              </button>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{unit.item_description}</span>
                {unit.wearer_name && (
                  <span class="block text-xs text-stone-500 dark:text-stone-400">
                    For {unit.wearer_name}
                  </span>
                )}
              </span>
              <span class="shrink-0 text-sm font-medium tabular-nums">
                {formatMinor(unit.price_minor, currency)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
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
  currency,
  balance,
  payments,
  onError,
}: {
  orderId: string
  currency: string
  balance: OrderBalance | null
  payments: PaymentDoc[]
  onError: (message: string | null) => void
}) {
  const { db, activeStaff } = useCurrentShop()
  const canRefund = usePermission('payments.refund')
  const canCreatePayment = usePermission('payments.create')
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')
  const [paidOn, setPaidOn] = useState(today)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const outstanding = balance
    ? outstandingMinor(balance.price_total_minor, balance.amount_paid_minor)
    : 0
  const settled = balance !== null && outstanding <= 0

  // Checked as you type, so an over-payment is caught before the tap, not after.
  const parsed = parseToMinor(amount, currency)
  const liveError =
    balance && amount.trim()
      ? paymentError({
          priceTotalMinor: balance.price_total_minor,
          amountPaidMinor: balance.amount_paid_minor,
          amountMinor: parsed ?? 0,
          kind: 'payment',
          currency,
        })
      : null

  const dateError = paymentDateError(paidOn)

  async function submit(event: Event) {
    event.preventDefault()
    if (liveError || dateError || parsed === null) {
      setFormError(liveError ?? dateError ?? 'Enter an amount greater than zero.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      await recordPayment(
        db,
        orderId,
        { amount_minor: parsed, method, notes, payment_date: paidOn },
        activeStaff?.id,
      )
      setAmount('')
      setNotes('')
      setPaidOn(today())
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
          settled ? (
            // Nothing is owed, so there is nothing to add. Say so rather than
            // offering a form that can only refuse.
            <span class="text-xs font-medium text-stone-500 dark:text-stone-400">Paid in full</span>
          ) : canCreatePayment ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              class="flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-400"
            >
              <IconPlus size={14} /> Add
            </button>
          ) : undefined
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
          <ul>
            {payments.map((payment) => (
              <li key={payment.id} class="flex items-center justify-between gap-3 px-4 py-3.5">
                <span class="min-w-0">
                  <span class="block font-medium">{formatMinor(payment.amount_minor, currency)}</span>
                  <span class="block truncate text-xs text-stone-500 dark:text-stone-400">
                    {PAYMENT_METHOD_LABELS[payment.method]} · {formatDateTime(payment.payment_date)}
                  </span>
                  {payment.notes && (
                    <span class="block truncate text-xs text-stone-500 dark:text-stone-400">
                      {payment.notes}
                    </span>
                  )}
                </span>
                {canRefund && (
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
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet open={adding} title="Record a payment" onClose={() => setAdding(false)}>
        <form onSubmit={submit} class="space-y-4">
          {outstanding > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(fromMinorUnits(outstanding, currency)))}
              class="min-h-11 w-full rounded-control bg-brand-100 px-3 text-sm
                     font-medium text-brand-800 active:bg-brand-200
                     dark:bg-brand-950 dark:text-brand-300"
            >
              Pay the full balance, {formatMinor(outstanding, currency)}
            </button>
          )}

          <Field
            label="Amount"
            error={liveError}
            hint={
              outstanding > 0
                ? `${formatMinor(outstanding, currency)} still owed. You cannot take more than that.`
                : undefined
            }
          >
            <Input
              inputmode="decimal"
              autofocus
              value={amount}
              aria-invalid={liveError ? true : undefined}
              onInput={(e) => {
                setAmount((e.target as HTMLInputElement).value)
                setFormError(null)
              }}
            />
          </Field>

          <Field
            label="Date taken"
            error={dateError}
            hint="Change it if this money came in on an earlier day."
          >
            <Input
              type="date"
              max={today()}
              value={paidOn}
              onInput={(e) => {
                setPaidOn((e.target as HTMLInputElement).value)
                setFormError(null)
              }}
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

          {formError && !liveError && <ErrorNote>{formError}</ErrorNote>}

          <div class="flex gap-2 pt-1">
            <Button variant="secondary" class="flex-1" type="button" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              class="flex-1"
              type="submit"
              disabled={saving || liveError !== null || dateError !== null || !amount.trim()}
            >
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
  clientId,
  orderId,
  phone,
  order,
  balance,
  overdue,
}: {
  shopName: string
  clientName: string
  clientId: string
  orderId: string
  phone: string | undefined
  order: OrderDoc
  balance: OrderBalance
  overdue: boolean
}) {
  const { db, staff, activeStaff } = useCurrentShop()
  const context = { shopName, clientName, order, balance }
  const statusLink = waLink(phone, suggestedMessage(context))
  const reminderLink = waLink(phone, balanceReminder(context))
  const showReminder = overdue && balance.balance_minor > 0 && reminderLink

  // Logged on click, not on render: this is the moment the shop commits to
  // sending, not merely that a link exists for them to tap.
  function logStatusUpdate(): void {
    void logMessage(
      db,
      { client_id: clientId, order_id: orderId, template: 'stage_update', order_stage: order.stage },
      activeStaff?.id,
    )
  }

  function logBalanceReminder(): void {
    void logMessage(
      db,
      { client_id: clientId, order_id: orderId, template: 'balance_reminder' },
      activeStaff?.id,
    )
  }

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
          <Button linkTo={statusLink} target="_blank" rel="noreferrer" block onClick={logStatusUpdate}>
            <IconWhatsApp size={18} /> Send {STAGE_LABELS[order.stage].toLowerCase()} update
          </Button>
          {showReminder && (
            <Button
              linkTo={reminderLink}
              target="_blank"
              rel="noreferrer"
              variant="secondary"
              block
              onClick={logBalanceReminder}
            >
              Send balance reminder
            </Button>
          )}
        </div>
        <LastReminderSent orderId={orderId} staff={staff} />
      </Card>
    </section>
  )
}

/**
 * Only 'balance_reminder' is a reminder -- a 'stage_update' (e.g. "ready for
 * pickup") is routine progress, not a chase, and labelling it "Reminder sent"
 * would tell staff the client had been chased about money when they had not.
 */
const MESSAGE_SENT_LABEL: Record<MessageTemplate, string> = {
  balance_reminder: 'Reminder sent',
  stage_update: 'Update sent',
  custom: 'Message sent',
}

/**
 * Shows when a message was last sent for this order, and by whom if
 * attributed. Never "notified" -- because a wa.me link only records that the
 * shop opened WhatsApp, not that WhatsApp delivered it.
 */
function LastReminderSent({ orderId, staff }: { orderId: string; staff: StaffDoc[] }) {
  const { db } = useCurrentShop()
  const logDocs = useRxQuery(
    () => db.message_log.find({ selector: { order_id: orderId }, sort: [{ sent_at: 'desc' }] }).$,
    [db, orderId],
    [],
  )
  const latest = logDocs[0]?.toJSON()
  if (!latest) return null

  const sender = latest.sent_by ? staff.find((member) => member.id === latest.sent_by)?.name : undefined

  return (
    <p class="mt-3 text-xs text-stone-500 dark:text-stone-400">
      {MESSAGE_SENT_LABEL[latest.template]} {formatDateTime(latest.sent_at)}
      {sender ? ` by ${sender}` : ''}
    </p>
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
