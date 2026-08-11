/**
 * Taking a payment without leaving the list.
 *
 * The phone build records a payment on the order's own screen, which is right
 * there: you are already looking at one order. At a desk you are working down a
 * list, and navigating away to take each payment is the round trip the whole
 * inspector exists to remove.
 *
 * `recordPayment` is the same write the phone build calls. Nothing about a
 * payment differs by design -- only where you are standing when you take it.
 */
import { useState } from 'preact/hooks'
import { useCurrentShop } from '../state/ShopProvider'
import { recordPayment } from '../db/writes'
import { PAYMENT_METHODS, type PaymentMethod } from '../db/schema'
import { PAYMENT_METHOD_LABELS } from '../screens/orderStage'
import { formatMinor, parseToMinor } from '../lib/money'
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
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const outstanding = Math.max(0, balance?.balance_minor ?? 0)

  async function submit(event: Event) {
    event.preventDefault()

    const parsed = parseToMinor(amount, shop.currency)
    if (parsed === null || parsed <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await recordPayment(db, orderId, { amount_minor: parsed, method }, activeStaff?.id)
      setAmount('')
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
          ? `${formatMinor(outstanding, shop.currency)} outstanding.`
          : 'This order is already settled.'
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
            onInput={(event) => setAmount((event.target as HTMLInputElement).value)}
            class={cn(
              'w-full border border-line-strong bg-page px-2.5 text-[13px] text-content',
              'outline-none focus:border-accent focus:ring-2 focus:ring-focus/25',
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

        {error && (
          <p role="alert" class={cn('bg-danger-soft px-2.5 py-1.5 text-danger', RADIUS, TEXT_XS)}>
            {error}
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
            disabled={saving}
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
