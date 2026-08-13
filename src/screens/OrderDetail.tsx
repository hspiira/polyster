/* Ordered the way a shop needs it: where is it, what is owed, tell the client.
   The balance comes from observeBalance(), never the view -- D9. */
import { useMemo, useState } from 'preact/hooks'
import { useLocation, useRoute } from 'preact-iso'
import {
  Button,
  Card,
  DataRow,
  EmptyState,
  ErrorNote,
  Screen,
  SectionTitle,
  StatStrip,
  StatTile,
} from '../components/ui'
import { IconCheck, IconEdit } from '../components/icons'
import { IllustrationSearch } from '../components/illustrations'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { usePermission } from '../hooks/usePermission'
import { useBack } from '../hooks/useBack'
import { observeBalance } from '../db/balances'
import { changeOrderStage } from '../db/writes'
import { formatMinor } from '../lib/money'
import { formatDate, formatDueDate } from '../lib/dates'
import { isOverdue } from './orderDetailModel'
import { CUSTOMER_TYPE_LABELS, ORDER_TYPE_LABELS, STAGE_LABELS, nextStage, stagesFor } from './orderStage'
import { BalanceCard } from './orderDetail/BalanceCard'
import { ItemsSection } from './orderDetail/ItemsSection'
import { MoneyBlock } from './orderDetail/MoneyBlock'
import { PaymentsSection } from './orderDetail/PaymentsSection'
import { StageHistory } from './orderDetail/StageHistory'
import { StageTrack } from './orderDetail/StageTrack'
import { WhatsAppSection } from './orderDetail/WhatsAppSection'

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
  const overdue = isOverdue(order)

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
              <p class="mt-4 flex items-center justify-center gap-2 text-sm text-success">
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
                  <a href={`/clients/${client.id}`} class="text-accent">
                    {client.name}
                  </a>
                ) : (
                  <span class="text-content-subtle">Unknown</span>
                )}
              </DataRow>
              <DataRow label="Type">{ORDER_TYPE_LABELS[order.order_type]}</DataRow>
              <DataRow label={order.order_type === 'rental' ? 'Collection' : 'Pickup'}>
                <span class={overdue ? 'text-danger' : ''}>
                  {formatDate(order.pickup_due_date)}
                  <span class="ml-1 font-normal text-content-muted">
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
              <p class="mt-4 whitespace-pre-wrap text-sm text-content-muted">
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

