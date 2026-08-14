import { Button, Card, SectionTitle } from '../../ui'
import { IconAlert, IconWhatsApp } from '../../components/icons'
import { useCurrentShop } from '../../state/ShopProvider'
import { useRxQuery } from '../../hooks/useRxQuery'
import { logMessage } from '../../db/writes'
import { formatDateTime } from '../../lib/dates'
import { balanceReminder, suggestedMessage, waLink } from '../../lib/whatsapp'
import { canSendBalanceReminder, lastMessage } from '../orderDetailModel'
import { STAGE_LABELS } from '../orderStage'
import type { OrderBalance } from '../../db/balances'
import type { OrderDoc, StaffDoc } from '../../db/schema'

/* Opens WhatsApp with the message already written. Nothing is sent on the
   shop's behalf, and the button says so. */
export function WhatsAppSection({
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
  const showReminder = canSendBalanceReminder({ overdue, balance, hasLink: Boolean(reminderLink) })

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
          <p class="flex gap-2 text-sm text-content-muted">
            <IconAlert size={18} class="mt-0.5 shrink-0 text-content-subtle" />
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
        <p class="mb-3 text-sm text-content-muted">
          Opens WhatsApp with the message ready. Nothing is sent until you tap send.
        </p>
        <div class="space-y-2">
          <Button linkTo={statusLink} target="_blank" rel="noreferrer" block onClick={logStatusUpdate}>
            <IconWhatsApp size={18} /> Send {STAGE_LABELS[order.stage].toLowerCase()} update
          </Button>
          {showReminder && reminderLink && (
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

function LastReminderSent({ orderId, staff }: { orderId: string; staff: StaffDoc[] }) {
  const { db } = useCurrentShop()
  const logDocs = useRxQuery(
    () => db.message_log.find({ selector: { order_id: orderId }, sort: [{ sent_at: 'desc' }] }).$,
    [db, orderId],
    [],
  )
  const latest = lastMessage(
    logDocs.map((doc) => doc.toJSON()),
    staff,
  )
  if (!latest) return null

  return (
    <p class="mt-3 text-xs text-content-muted">
      {latest.label} {formatDateTime(latest.sentAt)}
      {latest.senderName ? ` by ${latest.senderName}` : ''}
    </p>
  )
}
