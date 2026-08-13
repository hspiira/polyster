/** Expenses: money out, without which profit means nothing. */
import { useMemo, useState } from 'preact/hooks'
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Screen,
  SectionCard,
  Segmented,
  Skeleton,
} from '../components/ui'
import { IconMoney, IconPlus } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQueryStatus } from '../hooks/useRxQuery'
import { usePermission } from '../hooks/usePermission'
import { useBack } from '../hooks/useBack'
import { voidExpense } from '../db/writes'
import { formatMinor } from '../lib/money'
import { addDays, formatDate, today } from '../lib/dates'
import { AddExpenseSheet } from './ExpenseSheet'
import { EXPENSE_CATEGORY_LABELS } from './expenseCategories'

type Range = '7' | '30' | 'all'

const RANGES: readonly { value: Range; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: 'all', label: 'All' },
]

export function Expenses() {
  const { db, shop, activeStaff } = useCurrentShop()
  const canCreate = usePermission('expenses.create')
  const back = useBack()
  const [range, setRange] = useState<Range>('30')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = today()

  const { value: expenseDocs, loaded } = useRxQueryStatus(
    () => db.expenses.find({ selector: { shop_id: shop.id }, sort: [{ spent_on: 'desc' }] }).$,
    [db, shop.id],
    [],
  )
  const expenses = useMemo(() => expenseDocs.map((doc) => doc.toJSON()), [expenseDocs])

  const from = range === 'all' ? '1970-01-01' : addDays(now, -(Number(range) - 1))
  const inRange = useMemo(
    () => expenses.filter((expense) => expense.spent_on >= from),
    [expenses, from],
  )
  const totalMinor = useMemo(
    () => inRange.reduce((sum, expense) => sum + expense.amount_minor, 0),
    [inRange],
  )

  if (!loaded) {
    return (
      <Screen title="Expenses" back={back}>
        <div class="space-y-4">
          <Skeleton class="h-20 w-full" />
          <Skeleton class="h-40 w-full" />
        </div>
      </Screen>
    )
  }

  return (
    <Screen
      title="Expenses"
      back={back}
      action={
        expenses.length > 0 && canCreate && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <IconPlus size={16} /> Expense
          </Button>
        )
      }
    >
      <div class="space-y-5">
        {expenses.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              illustration={<IconMoney size={40} />}
              title="No expenses recorded"
              description="Fabric, rent, transport, wages. Without these the app can only show what came in, never what you actually made."
              action={
                canCreate ? <Button onClick={() => setAdding(true)}>Record an expense</Button> : undefined
              }
            />
          </Card>
        ) : (
          <>
            <Segmented value={range} options={RANGES} onChange={setRange} label="Period" />

            <Card>
              <p class="text-xs font-medium text-stone-500 dark:text-stone-400">Spent</p>
              <p class="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight">
                {formatMinor(totalMinor, shop.currency)}
              </p>
              <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
                {inRange.length} {inRange.length === 1 ? 'entry' : 'entries'}
              </p>
            </Card>

            {error && <ErrorNote>{error}</ErrorNote>}

            <SectionCard title="Recent" count={inRange.length}>
              <ul>
                {inRange.map((expense) => (
                  <li
                    key={expense.id}
                    class="flex items-center justify-between gap-3 px-4 py-3.5"
                  >
                    <span class="min-w-0">
                      <span class="block truncate font-medium">{expense.description}</span>
                      <span class="block truncate text-xs text-stone-500 dark:text-stone-400">
                        {EXPENSE_CATEGORY_LABELS[expense.category]} ·{' '}
                        {formatDate(expense.spent_on)}
                      </span>
                    </span>
                    <span class="flex shrink-0 items-center gap-2">
                      <span class="text-sm font-semibold tabular-nums">
                        {formatMinor(expense.amount_minor, shop.currency)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setError(null)
                          void voidExpense(db, expense.id, undefined, activeStaff?.id).catch(
                            (err: unknown) =>
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : 'Could not remove that expense.',
                              ),
                          )
                        }}
                      >
                        Void
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </>
        )}
      </div>

      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} />
    </Screen>
  )
}
