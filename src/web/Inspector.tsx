/**
 * The record, beside the list rather than instead of it.
 *
 * This pane is the reason the web design exists as its own design. On a phone,
 * opening an order is a navigation: you leave the list, look, and come back. At
 * a desk, checking six orders against a list should not cost six round trips,
 * so the record is a pane and the list keeps its scroll position and selection.
 *
 * It reads its own balance rather than taking the list row's figure, because a
 * row carries what is outstanding and this shows what was paid of what -- and
 * two derivations of the same money is how they drift.
 */
import { useMemo, useState } from 'preact/hooks'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { usePermission } from '../hooks/usePermission'
import { observeBalance, signedAmountMinor } from '../db/balances'
import { formatMinor } from '../lib/money'
import { dueBucket, formatDate, formatDateTime, formatDueDate, today } from '../lib/dates'
import {
  ORDER_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  STAGE_LABELS,
  STAGE_TONES,
} from '../screens/orderStage'
import type { DueRow } from '../screens/today/todayModel'
import { Chip } from '../ui'
import { IconChevronRight } from '../components/icons'
import { cn } from '../lib/cn'
import { CONTROL, RADIUS, TEXT_SM, TEXT_XS } from './chrome'
import { PaymentDialog } from './PaymentDialog'
import { refundDeposit } from '../db/writes'

type Tab = 'record' | 'units' | 'payments' | 'history'

const TABS: readonly { value: Tab; label: string }[] = [
  { value: 'record', label: 'Record' },
  { value: 'units', label: 'Units' },
  { value: 'payments', label: 'Payments' },
  { value: 'history', label: 'History' },
]

export function Inspector({
  row,
  chosen = false,
  onClose,
}: {
  row: DueRow | null
  /**
   * Whether a row was actually picked, as opposed to this falling back to the
   * first one. Only matters where the pane overlays the list: there, showing a
   * record nobody asked for would cover the table on arrival.
   */
  chosen?: boolean
  onClose?: () => void
}) {
  const { db, shop, staff } = useCurrentShop()
  const canCreatePayment = usePermission('payments.create')
  const canEdit = usePermission('orders.edit')
  const canRefund = usePermission('payments.refund')
  const [refunding, setRefunding] = useState(false)
  const [refundError, setRefundError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('record')
  const [paying, setPaying] = useState(false)

  const orderId = row?.order.id ?? '__none__'
  const balance = useRxQuery(() => observeBalance(db, orderId), [db, orderId], null)

  const unitDocs = useRxQuery(
    () => db.order_units.find({ selector: { order_id: orderId }, sort: [{ position: 'asc' }] }).$,
    [db, orderId],
    [],
  )
  const paymentDocs = useRxQuery(
    () => db.payments.find({ selector: { order_id: orderId }, sort: [{ payment_date: 'desc' }] }).$,
    [db, orderId],
    [],
  )
  const historyDocs = useRxQuery(
    () =>
      db.order_stage_history.find({
        selector: { order_id: orderId },
        sort: [{ changed_at: 'desc' }],
      }).$,
    [db, orderId],
    [],
  )

  const staffNames = useMemo(
    () => new Map(staff.map((member) => [member.id, member.name])),
    [staff],
  )

  if (!row) {
    return (
      <aside
        aria-label="Record"
        data-open="false"
        class="record-pane flex w-[21rem] shrink-0 items-center justify-center border-l border-line
               bg-surface px-6"
      >
        <p class={cn('text-center text-content-subtle', TEXT_SM)}>
          Choose an order to see it here.
        </p>
      </aside>
    )
  }

  const { order } = row
  const late = dueBucket(row.dueDate, today()) === 'overdue'

  async function refund() {
    setRefunding(true)
    setRefundError(null)
    try {
      await refundDeposit(db, order.id)
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : 'Could not refund this deposit.')
    } finally {
      setRefunding(false)
    }
  }
  const paidFraction =
    balance && balance.price_total_minor > 0
      ? Math.min(1, Math.max(0, balance.amount_paid_minor / balance.price_total_minor))
      : 0

  return (
    <aside
      aria-label={order.summary}
      data-open={chosen ? 'true' : 'false'}
      class="record-pane flex w-[21rem] shrink-0 flex-col border-l border-line bg-surface"
    >
      <div class="flex items-start gap-2 px-3.5 pb-2 pt-3">
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-[14.5px] font-semibold tracking-tight">{order.summary}</h2>
          <p class={cn('mt-0.5 truncate text-content-muted', TEXT_XS)}>
            {row.clientName}
            {order.reference && ` · ${order.reference}`}
          </p>
        </div>
        {/* Only rendered where the pane covers the list. As a column there is
            nothing to dismiss, so the button would be a dead control. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close record"
          class={cn(
            'record-close size-7 shrink-0 place-items-center text-content-muted',
            'hover:bg-hover hover:text-content',
            RADIUS,
          )}
        >
          <IconChevronRight size={15} />
        </button>
      </div>

      <div class="flex gap-3.5 border-b border-line px-3.5" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={tab === entry.value}
            onClick={() => setTab(entry.value)}
            class={cn(
              '-mb-px border-b-2 py-1.5 text-[12px] font-medium',
              tab === entry.value
                ? 'border-accent font-semibold text-content'
                : 'border-transparent text-content-muted hover:text-content',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div class="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-3.5 py-3">
        {/* The money block is above the tabs' content, not inside Record: it is
            the question asked at the counter and it should not need a tab. */}
        <div>
          <div class="flex items-end justify-between gap-2.5">
            <div>
              <p
                class={cn(
                  'mb-0.5 font-semibold uppercase tracking-[0.05em] text-content-subtle',
                  TEXT_XS,
                )}
              >
                {row.outstanding_minor > 0 ? 'Balance due' : 'Fully paid'}
              </p>
              <p
                class={cn(
                  'text-[24px] font-semibold leading-none tracking-tight tabular-nums',
                  row.outstanding_minor > 0 && 'text-money',
                )}
              >
                {formatMinor(row.outstanding_minor, shop.currency)}
              </p>
            </div>
            {balance && (
              <p class={cn('text-right tabular-nums text-content-muted', TEXT_XS)}>
                {formatMinor(balance.amount_paid_minor, shop.currency)}
                <br />
                of {formatMinor(balance.price_total_minor, shop.currency)}
              </p>
            )}
          </div>
          <div class="mt-2 h-[3px] overflow-hidden rounded-sm bg-surface-sunken">
            <div class="h-full bg-money" style={`width: ${paidFraction * 100}%`} />
          </div>
        </div>

        {tab === 'record' && (
          <>
            <dl class="grid grid-cols-2 gap-x-3.5 gap-y-1.5">
              <Fact label="Stage">
                <Chip tone={STAGE_TONES[order.stage]}>{STAGE_LABELS[order.stage]}</Chip>
              </Fact>
              <Fact label="Type">{ORDER_TYPE_LABELS[order.order_type]}</Fact>
              <Fact label={row.kind === 'return' ? 'Return' : 'Pickup'}>
                <span class={cn(late && 'text-danger')}>{formatDate(row.dueDate)}</span>
              </Fact>
              <Fact label="Due">{formatDueDate(row.dueDate)}</Fact>
            </dl>

            {order.notes && (
              <Section label="Notes">
                <p class={cn('whitespace-pre-wrap text-content-muted', TEXT_XS)}>{order.notes}</p>
              </Section>
            )}

            {order.rental_deposit_minor > 0 && (
              <Section label="Deposit">
                <p class={cn('text-content-muted', TEXT_XS)}>
                  {formatMinor(order.rental_deposit_minor, shop.currency)}
                  {order.deposit_refunded_at
                    ? ` -- refunded ${formatDateTime(order.deposit_refunded_at)}`
                    : ' -- held, not part of the balance above'}
                </p>
                {refundError && <p class={cn('mt-1 text-danger', TEXT_XS)}>{refundError}</p>}
                {!order.deposit_refunded_at && canRefund && (
                  <button
                    type="button"
                    onClick={() => void refund()}
                    disabled={refunding}
                    class={cn(
                      'mt-1.5 bg-surface-sunken px-2.5 py-1 font-semibold text-content hover:bg-pressed',
                      'disabled:opacity-60',
                      RADIUS,
                      TEXT_XS,
                    )}
                  >
                    {refunding ? 'Refunding...' : 'Refund deposit'}
                  </button>
                )}
              </Section>
            )}
          </>
        )}

        {tab === 'units' && (
          <Section label={`Units · ${unitDocs.length}`}>
            {unitDocs.length === 0 ? (
              <Empty>This order is a single item, with no separate units.</Empty>
            ) : (
              unitDocs.map((doc) => {
                const unit = doc.toJSON()
                return (
                  <div
                    key={unit.id}
                    class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b
                           border-line py-1.5 last:border-b-0"
                  >
                    <span class={cn('truncate', TEXT_XS)}>
                      {unit.item_description}
                      {unit.wearer_name && (
                        <span class="text-content-subtle"> · {unit.wearer_name}</span>
                      )}
                    </span>
                    <Chip tone={unit.done ? 'success' : 'neutral'}>
                      {unit.done ? 'Done' : 'Open'}
                    </Chip>
                    <span class={cn('font-semibold tabular-nums', TEXT_XS)}>
                      {formatMinor(unit.price_minor, shop.currency)}
                    </span>
                  </div>
                )
              })
            )}
          </Section>
        )}

        {tab === 'payments' && (
          <Section label={`Payments · ${paymentDocs.length}`}>
            {paymentDocs.length === 0 ? (
              <Empty>Nothing has been paid against this order yet.</Empty>
            ) : (
              paymentDocs.map((doc) => {
                const payment = doc.toJSON()
                const amount = signedAmountMinor(payment)
                return (
                  <div
                    key={payment.id}
                    class="flex items-baseline justify-between gap-2 border-b border-line py-1.5
                           last:border-b-0"
                  >
                    <span class={cn('min-w-0 truncate text-content-muted', TEXT_XS)}>
                      {PAYMENT_METHOD_LABELS[payment.method]} ·{' '}
                      {formatDateTime(payment.payment_date)}
                    </span>
                    <span
                      class={cn(
                        'shrink-0 font-semibold tabular-nums',
                        amount < 0 && 'text-danger',
                        TEXT_XS,
                      )}
                    >
                      {formatMinor(amount, shop.currency)}
                    </span>
                  </div>
                )
              })
            )}
          </Section>
        )}

        {tab === 'history' && (
          <Section label="Activity">
            {historyDocs.length === 0 ? (
              <Empty>No stage changes recorded on this device.</Empty>
            ) : (
              historyDocs.map((doc) => {
                const entry = doc.toJSON()
                return (
                  <div
                    key={entry.id}
                    class="flex items-baseline justify-between gap-2 border-b border-line py-1.5
                           last:border-b-0"
                  >
                    <span class={cn('min-w-0 truncate', TEXT_XS)}>
                      {STAGE_LABELS[entry.to_stage]}
                      {entry.changed_by && staffNames.has(entry.changed_by) && (
                        <span class="text-content-subtle">
                          {' '}
                          · {staffNames.get(entry.changed_by)}
                        </span>
                      )}
                    </span>
                    <span class={cn('shrink-0 text-content-subtle', TEXT_XS)}>
                      {formatDateTime(entry.changed_at)}
                    </span>
                  </div>
                )
              })
            )}
          </Section>
        )}
      </div>

      {(canCreatePayment || canEdit) && (
        <div class="flex gap-1.5 border-t border-line px-3.5 py-2.5">
          {canCreatePayment && (
            <button
              type="button"
              onClick={() => setPaying(true)}
              class={cn(
                'flex flex-1 items-center justify-center bg-accent font-semibold text-accent-content',
                'hover:brightness-110',
                CONTROL,
                RADIUS,
                TEXT_SM,
              )}
            >
              Take payment
            </button>
          )}
          {canEdit && (
            <a
              href={`/orders/${order.id}/edit`}
              class={cn(
                'flex items-center justify-center bg-surface-sunken px-3 font-semibold text-content',
                'hover:bg-pressed',
                CONTROL,
                RADIUS,
                TEXT_SM,
              )}
            >
              Edit
            </a>
          )}
        </div>
      )}

      <PaymentDialog
        open={paying}
        orderId={order.id}
        balance={balance}
        onClose={() => setPaying(false)}
      />
    </aside>
  )
}

function Fact({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div class="flex items-baseline justify-between gap-2 border-b border-line pb-1">
      <dt class={cn('text-content-muted', TEXT_XS)}>{label}</dt>
      <dd class={cn('m-0 text-right font-semibold', TEXT_XS)}>{children}</dd>
    </div>
  )
}

function Section({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div>
      <p
        class={cn('mb-1 font-semibold uppercase tracking-[0.06em] text-content-subtle', TEXT_XS)}
      >
        {label}
      </p>
      {children}
    </div>
  )
}

function Empty({ children }: { children: preact.ComponentChildren }) {
  return <p class={cn('py-1 text-content-subtle', TEXT_XS)}>{children}</p>
}
