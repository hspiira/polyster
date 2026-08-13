import { useState } from 'preact/hooks'
import { Button, ErrorNote, Field, Input, Select, Sheet, Textarea } from '../ui'
import { useCurrentShop } from '../state/ShopProvider'
import { recordExpense } from '../db/writes'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../db/schema'
import { parseToMinor } from '../lib/money'
import { today } from '../lib/dates'
import { EXPENSE_CATEGORY_LABELS } from './expenseCategories'

/** Shared by the Expenses screen and the Money tab's quick action. */
export function AddExpenseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
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
