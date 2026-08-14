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
  CurrencySwitch,
  Sections,
  ShareBar,
  Sheet,
  Skeleton,
  StatValue,
} from '../ui'
import { IconMoney, IconPlus, IconTag } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQueryStatus, useRxQuery } from '../hooks/useRxQuery'
import { usePeriod } from '../hooks/usePeriod'
import { useReportCurrency } from '../hooks/useReportCurrency'
import { itemsSold, saleTotalMinor } from '../db/profit'
import { voidSale } from '../db/writes'
import { formatAmount, formatMinor } from '../lib/money'
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
  const allSales = useMemo(() => saleDocs.map((doc) => doc.toJSON()), [saleDocs])

  const { currency, options: currencies, setCurrency } = useReportCurrency(
    shop.currency,
    allSales.map((sale) => sale.currency),
  )
  const sales = useMemo(
    () => allSales.filter((sale) => sale.currency === currency),
    [allSales, currency],
  )

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
  /* Top items plus everything else, so the strip is the whole period's takings
     rather than a selection that does not add up. */
  const shares = useMemo(() => {
    const sold = itemsSold(inRange, period.from, period.to)
    const top = sold.slice(0, TOP_ITEMS)
    const rest = sold.slice(TOP_ITEMS)
    const shares = top.map((row) => ({
      key: row.item,
      label: row.item,
      value: row.revenueMinor,
      formatted: formatAmount(row.revenueMinor, currency),
      hint: `${row.quantity} sold`,
    }))

    if (rest.length > 0) {
      const restMinor = rest.reduce((sum, row) => sum + row.revenueMinor, 0)
      const restCount = rest.reduce((sum, row) => sum + row.quantity, 0)
      shares.push({
        key: 'other',
        label: rest.length === 1 ? rest[0]!.item : `${rest.length} other items`,
        value: restMinor,
        formatted: formatAmount(restMinor, currency),
        hint: `${restCount} sold`,
      })
    }

    return shares
  }, [inRange, period.from, period.to, currency])

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
          <div class="flex items-center justify-between gap-3">
            <PeriodBar value={period.key} onChange={period.setKey} />
            <CurrencySwitch value={currency} options={currencies} onChange={setCurrency} />
          </div>
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
            <StatValue value={formatAmount(totalMinor, currency)} />
          </div>
          <p class="mt-1 text-sm text-content-muted">
            {inRange.length} {inRange.length === 1 ? 'sale' : 'sales'}
            {inRange.length > 0 &&
              ` · ${formatAmount(Math.round(totalMinor / inRange.length), currency)} on average`}
          </p>
        </Card>

        <Button class="w-full" linkTo="/sales/new">
          <IconPlus size={18} /> Record a sale
        </Button>

        {shares.length > 0 && (
          <Card flush>
            <h2 class="text-heading font-semibold">What sold</h2>
            <p class="mt-0.5 mb-3 text-xs text-content-muted">
              Share of {formatAmount(totalMinor, currency)} taken
            </p>
            <ShareBar
              shares={shares}
              total={totalMinor}
              summary={`Takings split across ${shares.length} lines. Best seller: ${shares[0]?.label ?? 'none'}, ${shares[0]?.formatted ?? ''}.`}
            />
          </Card>
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
                    currency={currency}
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
            {formatAmount(saleTotalMinor(sale), currency)}
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

/* A sale, and the one place it can be voided. A deliberate second step that
   asks for a reason, rather than a ghost button one stray tap from the takings. */
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
              onValue={setReason}
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
