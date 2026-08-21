import { useState } from 'preact/hooks'
import { Button, Card, DataRow, SectionTitle } from '../../ui'
import { useCurrentShop } from '../../state/ShopProvider'
import { usePermission } from '../../hooks/usePermission'
import { refundDeposit } from '../../db/repo'
import { formatMinor } from '../../lib/money'
import { formatDateTime } from '../../lib/dates'
import { depositView, moneyLines } from '../orderDetailModel'
import type { OrderBalance } from '../../db/balances'
import type { OrderDoc } from '../../db/schema'

/* Subtotal, adjustment, total, paid and balance as separate lines. A deposit is
   held, not earned, so it sits apart and is never folded in. */
export function MoneyBlock({
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

  const lines = moneyLines(order, balance)
  const deposit = depositView(order)

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
          {lines.map((line) => (
            <DataRow key={line.label} label={line.label}>
              {line.signed && (line.amountMinor < 0 ? '-' : '+')}
              {formatMinor(Math.abs(line.amountMinor), currency)}
            </DataRow>
          ))}
        </dl>
        {deposit && (
          <div class="mt-3 border-t border-line pt-3">
            <p class="text-sm text-content-muted">
              Deposit held: <span class="font-medium">{formatMinor(deposit.heldMinor, currency)}</span>
              {deposit.refundedAt
                ? ` -- refunded ${formatDateTime(deposit.refundedAt)}`
                : ' -- held, not part of the balance above'}
            </p>
            {deposit.refundable && canRefund && (
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
