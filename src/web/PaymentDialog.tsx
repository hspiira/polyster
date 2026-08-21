/* Taking a payment without leaving the list. Calls the same `recordPayment` the
   phone does: only where you are standing differs. */
import { useState } from 'preact/hooks'
import { useCurrentShop } from '../state/ShopProvider'
import { recordPayment } from '../db/repo'
import { PAYMENT_METHODS, type PaymentMethod } from '../db/schema'
import { PAYMENT_METHOD_LABELS } from '../screens/orderStage'
import { formatMinor, parseToMinor } from '../lib/money'
import { outstandingMinor, paymentDateError, paymentError } from '../lib/payments'
import { today } from '../lib/dates'
import type { OrderBalance } from '../db/balances'
import { cn } from '../lib/cn'
import { CONTROL, CONTROL_SM, RADIUS, TEXT_SM, TEXT_XS } from './chrome'
import { Dialog } from './Dialog'

export function PaymentDialog({
  open,
  orderId,
  balance,
  onClose,
}: {
  open: boolean
  orderId: string
  balance: OrderBalance | null
  onClose: () => void
}) {
  const { db, shop, activeStaff } = useCurrentShop()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [paidOn, setPaidOn] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const outstanding = balance
    ? outstandingMinor(balance.price_total_minor, balance.amount_paid_minor)
    : 0
  const settled = balance !== null && outstanding <= 0

  // Checked as you type, so the amount is never accepted only to be refused on
  // submit. Same rule the write enforces.
  const parsed = parseToMinor(amount, shop.currency)
  const liveError =
    balance && amount.trim()
      ? paymentError({
          priceTotalMinor: balance.price_total_minor,
          amountPaidMinor: balance.amount_paid_minor,
          amountMinor: parsed ?? 0,
          kind: 'payment',
          currency: shop.currency,
        })
      : null

  const dateError = paymentDateError(paidOn)

  async function submit(event: Event) {
    event.preventDefault()
    if (settled || liveError || dateError || parsed === null) {
      setError(liveError ?? dateError ?? 'Enter an amount greater than zero.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await recordPayment(
        db,
        orderId,
        { amount_minor: parsed, method, payment_date: paidOn },
        activeStaff?.id,
      )
      setAmount('')
      setPaidOn(today())
      setError(null)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record this payment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      title="Take payment"
      description={
        outstanding > 0
          ? `${formatMinor(outstanding, shop.currency)} outstanding. That is the most you can take.`
          : 'This order is fully paid. There is nothing left to take on it.'
      }
      onClose={onClose}
    >
      <form onSubmit={submit} class="flex flex-col gap-3">
        <label class="block">
          <span class={cn('mb-1 block font-medium text-content-muted', TEXT_XS)}>Amount</span>
          <input
            inputMode="decimal"
            value={amount}
            placeholder="0"
            disabled={settled}
            aria-invalid={liveError ? true : undefined}
            onInput={(event) => {
              setAmount((event.target as HTMLInputElement).value)
              setError(null)
            }}
            class={cn(
              'w-full border bg-page px-2.5 text-[13px] text-content',
              'outline-none focus:border-accent focus:ring-2 focus:ring-focus/25',
              'disabled:opacity-45',
              liveError ? 'border-danger' : 'border-line-strong',
              CONTROL,
              RADIUS,
            )}
          />
        </label>

        {outstanding > 0 && (
          <button
            type="button"
            onClick={() => setAmount(String(outstanding))}
            class={cn(
              'self-start bg-accent-soft px-2.5 font-medium text-accent-on-soft',
              CONTROL_SM,
              RADIUS,
              TEXT_XS,
            )}
          >
            Pay the full {formatMinor(outstanding, shop.currency)}
          </button>
        )}

        <label class="block">
          <span class={cn('mb-1 block font-medium text-content-muted', TEXT_XS)}>Date taken</span>
          <input
            type="date"
            max={today()}
            value={paidOn}
            disabled={settled}
            aria-invalid={dateError ? true : undefined}
            onInput={(event) => {
              setPaidOn((event.target as HTMLInputElement).value)
              setError(null)
            }}
            class={cn(
              'w-full border bg-page px-2.5 text-[13px] text-content',
              'outline-none focus:border-accent focus:ring-2 focus:ring-focus/25',
              'disabled:opacity-45',
              dateError ? 'border-danger' : 'border-line-strong',
              CONTROL,
              RADIUS,
            )}
          />
        </label>

        <div>
          <span class={cn('mb-1 block font-medium text-content-muted', TEXT_XS)}>Method</span>
          <div class="flex gap-1">
            {PAYMENT_METHODS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={method === value}
                onClick={() => setMethod(value)}
                class={cn(
                  'flex-1 border px-2 font-medium',
                  CONTROL_SM,
                  RADIUS,
                  TEXT_XS,
                  method === value
                    ? 'border-accent bg-accent text-accent-content'
                    : 'border-line-strong bg-surface text-content-muted hover:text-content',
                )}
              >
                {PAYMENT_METHOD_LABELS[value]}
              </button>
            ))}
          </div>
        </div>

        {(liveError ?? dateError ?? error) && (
          <p role="alert" class={cn('bg-danger-soft px-2.5 py-1.5 text-danger', RADIUS, TEXT_XS)}>
            {liveError ?? dateError ?? error}
          </p>
        )}

        <div class="mt-1 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            class={cn(
              'flex-1 bg-surface-sunken font-semibold text-content hover:bg-pressed',
              CONTROL,
              RADIUS,
              TEXT_SM,
            )}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              saving || settled || liveError !== null || dateError !== null || !amount.trim()
            }
            class={cn(
              'flex-[2] bg-accent font-semibold text-accent-content hover:brightness-110',
              'disabled:pointer-events-none disabled:opacity-45',
              CONTROL,
              RADIUS,
              TEXT_SM,
            )}
          >
            {saving ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
