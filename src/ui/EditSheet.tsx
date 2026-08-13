/**
 * Editing one value at a time, so a detail screen can stay a list of what
 * things are rather than a column of inputs asking what they should be.
 */
import { useEffect, useState } from 'preact/hooks'
import { IconCheck } from '../components/icons'
import { cn } from '../lib/cn'
import { Button } from './Button'
import { ErrorNote } from './Feedback'
import { Field, Input } from './Field'
import { Sheet } from './Surface'

/** One option per row, current one ticked. */
export function ChoiceSheet<T extends string>({
  open,
  title,
  value,
  options,
  onChoose,
  onClose,
}: {
  open: boolean
  title: string
  value: T
  options: readonly { value: T; label: string }[]
  onChoose: (value: T) => void
  onClose: () => void
}) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <ul role="radiogroup" aria-label={title} class="-mx-1">
        {options.map((option) => {
          const active = option.value === value
          return (
            <li key={option.value}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  onChoose(option.value)
                  onClose()
                }}
                class={cn(
                  'flex min-h-tap w-full items-center gap-3 rounded-control px-3 text-left',
                  'transition-colors hover:bg-hover active:bg-pressed',
                )}
              >
                <span class={cn('flex-1 text-[15px]', active && 'font-medium')}>{option.label}</span>
                {active && <IconCheck size={18} class="shrink-0 text-accent" />}
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

/**
 * One text value.
 *
 * `validate` returns a message to refuse with, or null to accept -- the
 * currency code is the case that needs it, and it belongs with the field
 * rather than in a save handler that has already closed the sheet.
 */
export function TextFieldSheet({
  open,
  title,
  label,
  hint,
  value,
  placeholder,
  type,
  validate,
  onSave,
  onClose,
}: {
  open: boolean
  title: string
  label: string
  hint?: string
  value: string
  placeholder?: string
  type?: 'text' | 'tel' | 'email' | 'url'
  validate?: (value: string) => string | null
  onSave: (value: string) => Promise<void> | void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Re-seeds each time it opens, so a cancelled edit does not persist as the
  // starting point of the next one.
  useEffect(() => {
    if (open) {
      setDraft(value)
      setError(null)
    }
  }, [open, value])

  async function submit(event: Event) {
    event.preventDefault()
    const problem = validate?.(draft) ?? null
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    try {
      await onSave(draft)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label={label} hint={hint}>
          <Input
            autofocus
            type={type ?? 'text'}
            inputmode={type === 'tel' ? 'tel' : undefined}
            value={draft}
            placeholder={placeholder}
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
