import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { Button, ErrorNote, Field, Input, Select, Sheet, Textarea } from '../ui'
import { useCurrentShop } from '../state/ShopProvider'
import { recordExpense, voidExpense } from '../db/writes'
import { EXPENSE_CATEGORIES, type ExpenseCategory, type ExpenseDoc } from '../db/schema'
import { formatMinor, parseToMinor } from '../lib/money'
import { formatDate, today } from '../lib/dates'
import { EXPENSE_CATEGORY_LABELS } from './expenseCategories'
import { useDraft } from '../hooks/useDraft'

interface ExpenseDraft {
  category: ExpenseCategory
  description: string
  amount: string
  spentOn: string
  notes: string
}

/** Shared by the Expenses screen and the Money tab's quick action. */
export function AddExpenseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, shop, activeStaff } = useCurrentShop()
  const { draft, set, reset } = useDraft<ExpenseDraft>(() => ({
    category: 'materials',
    description: '',
    amount: '',
    spentOn: today(),
    notes: '',
  }))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function close() {
    reset({ category: draft.category, description: '', amount: '', spentOn: today(), notes: '' })
    setError(null)
    onClose()
  }

  async function submit(event: Event) {
    event.preventDefault()

    if (!draft.description.trim()) {
      setError('Say what the money went on, or the report cannot tell you anything.')
      return
    }
    const amountMinor = parseToMinor(draft.amount, shop.currency)
    if (amountMinor === null || amountMinor <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (!draft.spentOn) {
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
          category: draft.category,
          description: draft.description,
          amount_minor: amountMinor,
          spent_on: draft.spentOn,
          ...(draft.notes.trim() ? { notes: draft.notes } : {}),
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
            value={draft.category}
            onValue={(v) => set('category', v as ExpenseCategory)}
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
            value={draft.description}
            placeholder="Fabric from Kikuubo"
            onValue={(v) => set('description', v)}
          />
        </Field>

        <div class="flex gap-3">
          <div class="flex-1">
            <Field label="Amount" hint={`In ${shop.currency}.`}>
              <Input
                inputmode="decimal"
                value={draft.amount}
                placeholder="0"
                onValue={(v) => set('amount', v)}
              />
            </Field>
          </div>
          <div class="flex-1">
            <Field label="Date">
              <Input
                type="date"
                value={draft.spentOn}
                onValue={(v) => set('spentOn', v)}
              />
            </Field>
          </div>
        </div>

        <Field label="Notes (optional)">
          <Textarea
            value={draft.notes}
            onValue={(v) => set('notes', v)}
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

/* An expense, and the one place it can be removed. Removing money out changes
   the profit figure, so it takes a deliberate step and records why. */
export function ExpenseDetailSheet({
  expense,
  onClose,
}: {
  expense: ExpenseDoc
  onClose: () => void
}) {
  const { db, activeStaff } = useCurrentShop()
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      await voidExpense(db, expense.id, reason, activeStaff?.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that expense.')
      setSaving(false)
    }
  }

  if (confirming) {
    return (
      <Sheet open title="Remove this expense?" onClose={onClose}>
        <div class="space-y-4">
          <p class="text-[15px] leading-relaxed text-content-muted">
            {formatMinor(expense.amount_minor, expense.currency)} stops counting against your
            profit, so the figure goes up. The entry is kept, with your reason and your name against
            it.
          </p>

          <Field label="Reason (optional)" hint="Entered twice, wrong amount, refunded.">
            <Input
              autofocus
              value={reason}
              placeholder="Entered twice"
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
              {saving ? 'Removing...' : 'Remove'}
            </Button>
          </div>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet open title="Expense" onClose={onClose}>
      <div class="space-y-4">
        <div>
          <p class="text-title font-semibold tabular-nums">
            {formatMinor(expense.amount_minor, expense.currency)}
          </p>
          <p class="mt-0.5 text-[15px] text-content-muted">{expense.description}</p>
        </div>

        <dl class="space-y-1.5">
          <ExpenseRow label="Category">{EXPENSE_CATEGORY_LABELS[expense.category]}</ExpenseRow>
          <ExpenseRow label="Spent on">{formatDate(expense.spent_on)}</ExpenseRow>
          {expense.notes && <ExpenseRow label="Notes">{expense.notes}</ExpenseRow>}
        </dl>

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Close
          </Button>
          <Button variant="danger" class="flex-1" type="button" onClick={() => setConfirming(true)}>
            Remove
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

function ExpenseRow({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="flex items-baseline justify-between gap-4">
      <dt class="text-sm text-content-muted">{label}</dt>
      <dd class="text-right text-sm font-medium">{children}</dd>
    </div>
  )
}
