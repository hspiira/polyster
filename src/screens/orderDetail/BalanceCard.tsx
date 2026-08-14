import { Card } from '../../ui'
import { formatMinor } from '../../lib/money'
import { balanceView } from '../orderDetailModel'
import type { OrderBalance } from '../../db/balances'

/* The question asked at the counter, sized accordingly. The amount carries the
   money colour and the card carries none. */
export function BalanceCard({
  balance,
  currency,
}: {
  balance: OrderBalance | null
  currency: string
}) {
  if (!balance) return <Card><div class="h-20" /></Card>

  const view = balanceView(balance)
  const owing = view.state === 'owing'

  return (
    <Card>
      {/* Uppercase and small, then the figure very large: the label is read
          once and the number is read across a counter. */}
      <p class="text-[11px] font-semibold uppercase tracking-[0.05em] text-content-subtle">
        {view.label}
      </p>
      <p
        class={`mt-1 text-[34px] font-semibold leading-none tracking-tight tabular-nums ${
          owing ? 'text-money' : 'text-content'
        }`}
      >
        {formatMinor(view.amountMinor, currency)}
      </p>
      <p class="mt-1.5 text-[13px] text-content-muted">
        {formatMinor(view.paidMinor, currency)} paid of {formatMinor(view.totalMinor, currency)}
      </p>
      <div class="mt-3 h-1 overflow-hidden rounded-full bg-surface-sunken">
        <div
          class={`h-full rounded-full transition-[width] duration-500 ${
            owing ? 'bg-money' : 'bg-success'
          }`}
          style={{ width: `${view.paidFraction * 100}%` }}
        />
      </div>
    </Card>
  )
}
