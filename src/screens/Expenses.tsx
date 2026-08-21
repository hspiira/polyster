/** Expenses: money out, without which profit means nothing. */
import { useMemo, useState } from 'preact/hooks'
import {
  Button,
  Card,
  EmptyState,
  FLUSH_SURFACE,
  PeriodBar,
  PeriodRangeFields,
  CurrencySwitch,
  Screen,
  Sections,
  ShareBar,
  Skeleton,
  StatValue,
} from '../ui'
import { IconPlus, IconReceipt } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useQueryStatus } from '../hooks/useQuery'
import { usePermission } from '../hooks/usePermission'
import { usePeriod } from '../hooks/usePeriod'
import { useReportCurrency } from '../hooks/useReportCurrency'
import { formatAmount } from '../lib/money'
import { formatPastDay } from '../lib/dates'
import { AddExpenseSheet, ExpenseDetailSheet } from './ExpenseSheet'
import { useMoneySections } from './moneySections'
import { EXPENSE_CATEGORY_LABELS } from './expenseCategories'
import type { ExpenseCategory, ExpenseDoc } from '../db/schema'
import { observeExpenses } from '../db/repo'

export function Expenses() {
  const { db, shop } = useCurrentShop()
  const canCreate = usePermission('expenses.create')
  const sections = useMoneySections()
  const period = usePeriod('30')
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<ExpenseDoc | null>(null)

  const { value: expenseDocs, loaded } = useQueryStatus(
    () => observeExpenses(db, shop.id),
    [db, shop.id],
    [],
  )
  const allExpenses = expenseDocs

  const { currency, options: currencies, setCurrency } = useReportCurrency(
    shop.currency,
    allExpenses.map((expense) => expense.currency),
  )
  const expenses = useMemo(
    () => allExpenses.filter((expense) => expense.currency === currency),
    [allExpenses, currency],
  )

  const inRange = useMemo(
    () =>
      expenses.filter(
        (expense) => expense.spent_on >= period.from && expense.spent_on <= period.to,
      ),
    [expenses, period.from, period.to],
  )
  const totalMinor = useMemo(
    () => inRange.reduce((sum, expense) => sum + expense.amount_minor, 0),
    [inRange],
  )

  const shares = useMemo(() => {
    const totals = new Map<ExpenseCategory, number>()
    for (const expense of inRange) {
      totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount_minor)
    }
    return [...totals]
      .sort((a, b) => b[1] - a[1])
      .map(([category, amountMinor]) => ({
        key: category,
        label: EXPENSE_CATEGORY_LABELS[category],
        value: amountMinor,
        formatted: formatAmount(amountMinor, currency),
      }))
  }, [inRange, currency])

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

  if (expenses.length === 0) {
    return (
      <Screen label="Money" sections={sections}>
        <EmptyState
          spacious
          illustration={<IconReceipt size={56} />}
          title="No expenses recorded"
          description="Fabric, rent, transport, wages. Without these the app can only show what came in, never what you actually made."
          action={
            canCreate ? (
              <Button onClick={() => setAdding(true)}>
                <IconPlus size={18} /> Record an expense
              </Button>
            ) : undefined
          }
        />
        <AddExpenseSheet open={adding} onClose={() => setAdding(false)} />
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
          <p class="text-sm text-content-muted">Spent, {period.label}</p>
          <div class="mt-1">
            <StatValue value={formatAmount(totalMinor, currency)} tone="danger" />
          </div>
          <p class="mt-1 text-sm text-content-muted">
            {inRange.length} {inRange.length === 1 ? 'entry' : 'entries'}
          </p>
        </Card>

        {canCreate && (
          <Button class="w-full" onClick={() => setAdding(true)}>
            <IconPlus size={18} /> Record an expense
          </Button>
        )}

        {shares.length > 1 && (
          <Card flush>
            <h2 class="text-heading font-semibold">Where it went</h2>
            <p class="mt-0.5 mb-3 text-xs text-content-muted">
              {shares.length} {shares.length === 1 ? 'category' : 'categories'}
            </p>
            <ShareBar
              shares={shares}
              total={totalMinor}
              summary={`Spending split across ${shares.length} categories. Largest: ${shares[0]?.label ?? 'none'}, ${shares[0]?.formatted ?? ''}.`}
            />
          </Card>
        )}

        {inRange.length === 0 ? (
          <Card flush>
            <EmptyState
              illustration={<IconReceipt size={40} />}
              title="Nothing spent in this period"
              description="Change the period above, or record what the shop paid out."
            />
          </Card>
        ) : (
          <section class={FLUSH_SURFACE}>
            <h2 class="flex items-baseline gap-1.5 px-gutter pt-3 pb-1 text-heading font-semibold">
              Recent
              <span class="text-xs font-normal text-content-muted">{inRange.length}</span>
            </h2>
            <ul class="pb-1">
              {inRange.map((expense) => (
                <li key={expense.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(expense)}
                    class="flex min-h-tap w-full items-center gap-3 px-gutter py-2.5 text-left
                           transition-colors hover:bg-hover active:bg-pressed"
                  >
                    <span class="min-w-0 flex-1">
                      <span class="flex items-baseline gap-2">
                        <span class="min-w-0 flex-1 truncate text-[15px] font-medium">
                          {expense.description}
                        </span>
                        <span class="shrink-0 text-sm font-semibold tabular-nums text-danger">
                          -{formatAmount(expense.amount_minor, currency)}
                        </span>
                      </span>
                      <span class="mt-0.5 block truncate text-xs text-content-muted">
                        {formatPastDay(expense.spent_on)} ·{' '}
                        {EXPENSE_CATEGORY_LABELS[expense.category]}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Sections>

      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} />
      {open && <ExpenseDetailSheet expense={open} onClose={() => setOpen(null)} />}
    </Screen>
  )
}
