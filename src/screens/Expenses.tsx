/**
 * Expenses: money out.
 *
 * The other half of the picture 0005's design document called out as missing.
 * Recording is a sheet rather than its own screen: an expense is four short
 * fields, and a shop entering the day's receipts should not lose its place in
 * the list between each one.
 */
import { useMemo, useState } from 'preact/hooks'
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Screen,
  SectionCard,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  Textarea,
} from '../components/ui'
import { IconMoney, IconPlus } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useRxQueryStatus } from '../hooks/useRxQuery'
import { usePermission } from '../hooks/usePermission'
import { recordExpense, voidExpense } from '../db/writes'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../db/schema'
import { formatMinor, parseToMinor } from '../lib/money'
import { addDays, formatDate, today } from '../lib/dates'

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  materials: 'Materials',
  rent: 'Rent',
  wages: 'Wages',
  transport: 'Transport',
  utilities: 'Utilities',
  other: 'Other',
}

type Range = '7' | '30' | 'all'

const RANGES: readonly { value: Range; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: 'all', label: 'All' },
]

export function Expenses() {
  const { db, shop, activeStaff } = useCurrentShop()
  const canCreate = usePermission('expenses.create')
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
      <Screen title="Expenses">
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
      back="/settings"
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

function AddExpenseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, shop, activeStaff } = useCurrentShop()
  const [category, setCategory] = useState<ExpenseCategory>('materials')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [spentOn, setSpentOn] = useState(today())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function close() {
    setDescription('')
    setAmount('')
    setNotes('')
    setSpentOn(today())
    setError(null)
    onClose()
  }

  async function submit(event: Event) {
    event.preventDefault()

    if (!description.trim()) {
      setError('Say what the money went on, or the report cannot tell you anything.')
      return
    }
    const amountMinor = parseToMinor(amount, shop.currency)
    if (amountMinor === null || amountMinor <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (!spentOn) {
      setError('A date is needed, so it lands in the right period.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await recordExpense(
        db,
        shop,
        {
          category,
          description,
          amount_minor: amountMinor,
          spent_on: spentOn,
          ...(notes.trim() ? { notes } : {}),
        },
        activeStaff?.id,
      )
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record this expense.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title="Record an expense" onClose={close}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Category">
          <Select
            value={category}
            onChange={(e) =>
              setCategory((e.target as HTMLSelectElement).value as ExpenseCategory)
            }
          >
            {EXPENSE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {EXPENSE_CATEGORY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="What for">
          <Input
            autofocus
            value={description}
            placeholder="Fabric from Kikuubo"
            onInput={(e) => setDescription((e.target as HTMLInputElement).value)}
          />
        </Field>

        <div class="flex gap-3">
          <div class="flex-1">
            <Field label="Amount" hint={`In ${shop.currency}.`}>
              <Input
                inputmode="decimal"
                value={amount}
                placeholder="0"
                onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
              />
            </Field>
          </div>
          <div class="flex-1">
            <Field label="Date">
              <Input
                type="date"
                value={spentOn}
                onInput={(e) => setSpentOn((e.target as HTMLInputElement).value)}
              />
            </Field>
          </div>
        </div>

        <Field label="Notes (optional)">
          <Textarea
            value={notes}
            onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={close}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Record'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
