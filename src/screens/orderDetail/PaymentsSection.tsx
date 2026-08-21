import { useState } from 'preact/hooks'
import { Button, Card, ErrorNote, Field, Input, SectionTitle, Segmented, Sheet } from '../../ui'
import { IconPlus } from '../../components/icons'
import { useCurrentShop } from '../../state/ShopProvider'
import { usePermission } from '../../hooks/usePermission'
import { recordPayment, voidPayment } from '../../db/repo'
import { PAYMENT_METHODS, type PaymentDoc, type PaymentMethod } from '../../db/schema'
import { formatMinor, fromMinorUnits, parseToMinor } from '../../lib/money'
import { outstandingMinor, paymentDateError, paymentError } from '../../lib/payments'
import { formatDateTime, today } from '../../lib/dates'
import { isSettled } from '../orderDetailModel'
import { PAYMENT_METHOD_LABELS } from '../orderStage'
import type { OrderBalance } from '../../db/balances'

export function PaymentsSection({
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
  const settled = isSettled(balance)

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
            <span class="text-xs font-medium text-content-muted">Paid in full</span>
          ) : canCreatePayment ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              class="flex items-center gap-1 text-xs font-semibold text-accent"
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
          <p class="text-center text-sm text-content-muted">
            No payments recorded yet.
          </p>
        ) : (
          <ul>
            {payments.map((payment) => (
              <li key={payment.id} class="flex items-center justify-between gap-3 px-4 py-3.5">
                <span class="min-w-0">
                  <span class="block font-medium">{formatMinor(payment.amount_minor, currency)}</span>
                  <span class="block truncate text-xs text-content-muted">
                    {PAYMENT_METHOD_LABELS[payment.method]} · {formatDateTime(payment.payment_date)}
                  </span>
                  {payment.notes && (
                    <span class="block truncate text-xs text-content-muted">
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
              class="min-h-11 w-full rounded-control bg-accent-soft px-3 text-sm
                     font-medium text-accent-on-soft active:bg-accent-soft/70"
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
              onValue={(value) => {
                setAmount(value)
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
              onValue={(value) => {
                setPaidOn(value)
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
            <Input value={notes} onValue={setNotes} />
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
