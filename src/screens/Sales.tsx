/** Sales: what went over the counter, and what sold most. */
import { useMemo, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  FLUSH_SURFACE,
  Input,
  PeriodBar,
  PeriodRangeFields,
  Screen,
  Sections,
  Sheet,
  Skeleton,
  StatValue,
} from '../ui'
import { IconMoney, IconPlus, IconTag } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQueryStatus, useRxQuery } from '../hooks/useRxQuery'
import { usePeriod } from '../hooks/usePeriod'
import { itemsSold, saleTotalMinor } from '../db/profit'
import { voidSale } from '../db/writes'
import { formatMinor } from '../lib/money'
import { formatPastDay, formatTime } from '../lib/dates'
import { useMoneySections } from './moneySections'
import { PAYMENT_METHOD_LABELS } from './orderStage'
import type { SaleDoc } from '../db/schema'

const TOP_ITEMS = 5

export function Sales() {
  const { db, shop } = useCurrentShop()
  const sections = useMoneySections()
  const period = usePeriod('7')
  const [open, setOpen] = useState<SaleDoc | null>(null)

  const { value: saleDocs, loaded } = useRxQueryStatus(
    () => db.sales.find({ selector: { shop_id: shop.id }, sort: [{ sold_at: 'desc' }] }).$,
    [db, shop.id],
    [],
  )
  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )

  const clientNames = useMemo(
    () => new Map(clientDocs.map((doc) => [doc.id, doc.name])),
    [clientDocs],
  )
  const sales = useMemo(() => saleDocs.map((doc) => doc.toJSON()), [saleDocs])

  const inRange = useMemo(
    () =>
      sales.filter((sale) => {
        const day = sale.sold_at.slice(0, 10)
        return day >= period.from && day <= period.to
      }),
    [sales, period.from, period.to],
  )
  const totalMinor = useMemo(
    () => inRange.reduce((sum, sale) => sum + saleTotalMinor(sale), 0),
    [inRange],
  )
  const top = useMemo(
    () => itemsSold(inRange, period.from, period.to).slice(0, TOP_ITEMS),
    [inRange, period.from, period.to],
  )

  if (!loaded) {
    return (
      <Screen label="Money" sections={sections}>
        <div class="space-y-4">
          <Skeleton class="h-24 w-full" />
          <Skeleton class="h-40 w-full" />
        </div>
      </Screen>
    )
  }

  if (sales.length === 0) {
    return (
      <Screen label="Money" sections={sections}>
        <EmptyState
          spacious
          illustration={<IconMoney size={56} />}
          title="No sales recorded yet"
          description="A sale is money taken over the counter -- a ready-made shirt, a metre of fabric. No client record needed."
          action={
            <Button linkTo="/sales/new">
              <IconPlus size={18} /> Record a sale
            </Button>
          }
        />
      </Screen>
    )
  }

  return (
    <Screen label="Money" sections={sections}>
      <Sections>
        <div>
          <PeriodBar value={period.key} onChange={period.setKey} />
          {period.key === 'custom' && (
            <PeriodRangeFields
              range={{ from: period.from, to: period.to }}
              onChange={period.setRange}
            />
          )}
        </div>

        <Card flush>
          <p class="text-sm text-content-muted">Taken over the counter, {period.label}</p>
          <div class="mt-1">
            <StatValue value={formatMinor(totalMinor, shop.currency)} />
          </div>
          <p class="mt-1 text-sm text-content-muted">
            {inRange.length} {inRange.length === 1 ? 'sale' : 'sales'}
            {inRange.length > 0 &&
              ` · ${formatMinor(Math.round(totalMinor / inRange.length), shop.currency)} on average`}
          </p>
        </Card>

        <Button class="w-full" linkTo="/sales/new">
          <IconPlus size={18} /> Record a sale
        </Button>

        {top.length > 0 && (
          <section class={FLUSH_SURFACE}>
            <h2 class="px-gutter pt-3 pb-1 text-heading font-semibold">What sold</h2>
            <ul class="px-gutter pt-1 pb-3">
              {top.map((row) => (
                <li key={row.item} class="py-1.5">
                  <div class="flex items-baseline justify-between gap-3">
                    <span class="min-w-0 flex-1 truncate text-[15px] font-medium">{row.item}</span>
                    <span class="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMinor(row.revenueMinor, shop.currency)}
                    </span>
                  </div>
                  {/* Share of the period's takings. A bar, not a chart, for five numbers. */}
                  <div class="mt-1 flex items-center gap-2">
                    <span class="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
                      <span
                        class="block h-full rounded-pill bg-accent"
                        style={{
                          width: `${totalMinor === 0 ? 0 : (row.revenueMinor / totalMinor) * 100}%`,
                        }}
                      />
                    </span>
                    <span class="shrink-0 text-xs tabular-nums text-content-muted">
                      {row.quantity} sold
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {inRange.length === 0 ? (
          <Card flush>
            <EmptyState
              illustration={<IconTag size={40} />}
              title="Nothing sold in this period"
              description="Change the period above, or record what went over the counter."
            />
          </Card>
        ) : (
          <section class={FLUSH_SURFACE}>
            <h2 class="flex items-baseline gap-1.5 px-gutter pt-3 pb-1 text-heading font-semibold">
              Recent
              <span class="text-xs font-normal text-content-muted">{inRange.length}</span>
            </h2>
            <ul class="pb-1">
              {inRange.map((sale) => (
                <li key={sale.id}>
                  <SaleRow
                    sale={sale}
                    currency={shop.currency}
                    clientName={sale.client_id ? clientNames.get(sale.client_id) : undefined}
                    onOpen={() => setOpen(sale)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </Sections>

      {open && (
        <SaleSheet
          sale={open}
          clientName={open.client_id ? clientNames.get(open.client_id) : undefined}
          onClose={() => setOpen(null)}
        />
      )}
    </Screen>
  )
}

function SaleRow({
  sale,
  currency,
  clientName,
  onOpen,
}: {
  sale: SaleDoc
  currency: string
  clientName?: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      class="flex min-h-tap w-full items-center gap-3 px-gutter py-2.5 text-left
             transition-colors hover:bg-hover active:bg-pressed"
    >
      <span class="min-w-0 flex-1">
        <span class="flex items-baseline gap-2">
          <span class="min-w-0 flex-1 truncate text-[15px] font-medium">
            {sale.quantity > 1 && `${sale.quantity} × `}
            {sale.item_description}
          </span>
          <span class="shrink-0 text-sm font-semibold tabular-nums">
            {formatMinor(saleTotalMinor(sale), currency)}
          </span>
        </span>
        <span class="mt-0.5 block truncate text-xs text-content-muted">
          {formatPastDay(sale.sold_at.slice(0, 10))} {formatTime(sale.sold_at)} ·{' '}
          {PAYMENT_METHOD_LABELS[sale.method]}
          {clientName ? ` · ${clientName}` : ''}
        </span>
      </span>
    </button>
  )
}

/**
 * A sale, and the one place it can be voided.
 *
 * Void used to be a ghost button on every row: a destructive write one stray
 * tap away, with no confirmation and no reason, so the day's takings could
 * change and nothing recorded why or who. It now costs a deliberate second
 * step, and asks for the reason where someone is already looking at the sale.
 */
function SaleSheet({
  sale,
  clientName,
  onClose,
}: {
  sale: SaleDoc
  clientName?: string
  onClose: () => void
}) {
  const { db, activeStaff } = useCurrentShop()
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const total = saleTotalMinor(sale)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      await voidSale(db, sale.id, reason, activeStaff?.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not void that sale.')
      setSaving(false)
    }
  }

  if (confirming) {
    return (
      <Sheet open title="Void this sale?" onClose={onClose}>
        <div class="space-y-4">
          <p class="text-[15px] leading-relaxed text-content-muted">
            {formatMinor(total, sale.currency)} stops counting towards your takings and your profit.
            The sale is kept, with your reason and your name against it.
          </p>

          <Field label="Reason (optional)" hint="Returned, wrong amount, entered twice.">
            <Input
              autofocus
              value={reason}
              placeholder="Returned"
              onInput={(e) => setReason((e.target as HTMLInputElement).value)}
            />
          </Field>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div class="flex gap-2 pt-1">
            <Button
              variant="secondary"
              class="flex-1"
              type="button"
              onClick={() => setConfirming(false)}
            >
              Keep it
            </Button>
            <Button
              variant="danger"
              class="flex-1"
              type="button"
              disabled={saving}
              onClick={() => void submit()}
            >
              {saving ? 'Voiding...' : 'Void sale'}
            </Button>
          </div>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet open title="Sale" onClose={onClose}>
      <div class="space-y-4">
        <div>
          <p class="text-title font-semibold tabular-nums">{formatMinor(total, sale.currency)}</p>
          <p class="mt-0.5 text-[15px] text-content-muted">
            {sale.quantity > 1
              ? `${sale.quantity} × ${sale.item_description}, ${formatMinor(sale.unit_price_minor, sale.currency)} each`
              : sale.item_description}
          </p>
        </div>

        <dl class="space-y-1.5">
          <SheetRow label="When">
            {formatPastDay(sale.sold_at.slice(0, 10))} {formatTime(sale.sold_at)}
          </SheetRow>
          <SheetRow label="Paid by">{PAYMENT_METHOD_LABELS[sale.method]}</SheetRow>
          {clientName && <SheetRow label="Client">{clientName}</SheetRow>}
          {sale.reference && <SheetRow label="Reference">{sale.reference}</SheetRow>}
          {sale.notes && <SheetRow label="Notes">{sale.notes}</SheetRow>}
        </dl>

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Close
          </Button>
          <Button variant="danger" class="flex-1" type="button" onClick={() => setConfirming(true)}>
            Void sale
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

function SheetRow({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="flex items-baseline justify-between gap-4">
      <dt class="text-sm text-content-muted">{label}</dt>
      <dd class="text-right text-sm font-medium">{children}</dd>
    </div>
  )
}
