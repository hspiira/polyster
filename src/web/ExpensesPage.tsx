/**
 * Expenses, at a desk: money out, with the categories beside it.
 *
 * Recording one is still the phone's job -- it happens as it happens, standing
 * up, and there is nothing a desk adds to typing an amount. What a desk adds is
 * reading them back: a period, a total, and where the money went.
 */
import { useMemo, useState } from 'preact/hooks'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { formatMinor } from '../lib/money'
import { addDays, formatDate, today } from '../lib/dates'
import { EXPENSE_CATEGORY_LABELS } from '../screens/Expenses'
import type { ExpenseCategory, ExpenseDoc } from '../db/schema'
import { EmptyState } from '../ui'
import { IconMoney } from '../components/icons'
import { cn } from '../lib/cn'
import { Page } from './Page'
import { Table, type TableColumn } from './Table'
import { RADIUS, TEXT_SM, TEXT_XS } from './chrome'
import { PeriodSwitch, RANGES, type RangeKey } from './period'

export function ExpensesPage() {
  const { db, shop } = useCurrentShop()
  const [range, setRange] = useState<RangeKey>('30')
  const now = today()
  const from = addDays(now, -(RANGES[range].days - 1))

  const expenseDocs = useRxQuery(
    () => db.expenses.find({ selector: { shop_id: shop.id }, sort: [{ spent_on: 'desc' }] }).$,
    [db, shop.id],
    [],
  )

  const inPeriod = useMemo(
    () =>
      expenseDocs
        .map((doc) => doc.toJSON())
        .filter((expense) => expense.spent_on >= from && expense.spent_on <= now),
    [expenseDocs, from, now],
  )

  const total = useMemo(
    () => inPeriod.reduce((sum, expense) => sum + expense.amount_minor, 0),
    [inPeriod],
  )

  const byCategory = useMemo(() => {
    const totals = new Map<ExpenseCategory, number>()
    for (const expense of inPeriod) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount_minor)
    }
    return [...totals].sort((a, b) => b[1] - a[1])
  }, [inPeriod])

  const columns: TableColumn<ExpenseDoc>[] = [
    {
      id: 'description',
      label: 'Description',
      width: 'minmax(9rem, 2.4fr)',
      render: (expense) => <span class="truncate font-semibold">{expense.description}</span>,
    },
    {
      id: 'category',
      label: 'Category',
      width: 'minmax(6rem, 1fr)',
      render: (expense) => EXPENSE_CATEGORY_LABELS[expense.category],
    },
    {
      id: 'spent',
      label: 'Spent',
      width: '6.5rem',
      render: (expense) => formatDate(expense.spent_on),
    },
    {
      id: 'amount',
      label: 'Amount',
      width: '6.5rem',
      align: 'end',
      render: (expense) => (
        <span class="font-semibold">{formatMinor(expense.amount_minor, shop.currency)}</span>
      ),
    },
  ]

  return (
    <Page
      crumbs={['Money']}
      title="Expenses"
      viewbar={
        <>
          <PeriodSwitch value={range} onChange={setRange} />
          <span class="flex-1" />
          <span class={cn('text-content-subtle tabular-nums', TEXT_XS)}>
            {inPeriod.length} in {RANGES[range].label.toLowerCase()} ·{' '}
            <span class="font-semibold text-content">{formatMinor(total, shop.currency)}</span>
          </span>
        </>
      }
    >
      <div class="work-split-outer">
        <div class="work-split">
          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
            <Table
              label="Expenses"
              items={inPeriod}
              columns={columns}
              getKey={(expense) => expense.id}
              empty={
                <EmptyState
                  illustration={<IconMoney size={22} />}
                  title="Nothing recorded"
                  description="Record what the shop spends and the profit figure on Reports becomes real."
                />
              }
            />
          </div>

          {byCategory.length > 0 && (
          <aside class={cn('side-pane flex flex-col overflow-hidden bg-surface', RADIUS)}>
            <h2 class={cn('shrink-0 px-3 pb-1.5 pt-2.5 font-semibold', TEXT_SM)}>Where it went</h2>
            <ul class="min-h-0 overflow-y-auto pb-2">
              {byCategory.map(([category, amount]) => (
                <li key={category} class="px-3 py-1.5">
                  <div class="flex items-baseline justify-between gap-2">
                    <span class={TEXT_XS}>{EXPENSE_CATEGORY_LABELS[category]}</span>
                    <span class={cn('shrink-0 font-semibold tabular-nums', TEXT_XS)}>
                      {formatMinor(amount, shop.currency)}
                    </span>
                  </div>
                  {/* A share of the period's total, not of the largest line:
                      the question is how much of the spend this is. */}
                  <div class="mt-1 h-[3px] overflow-hidden rounded-sm bg-surface-sunken">
                    <div
                      class="h-full bg-content-subtle"
                      style={`width: ${total > 0 ? (amount / total) * 100 : 0}%`}
                    />
                  </div>
                </li>
              ))}
              </ul>
            </aside>
          )}
        </div>
      </div>
    </Page>
  )
}
