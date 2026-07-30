/**
 * What this shop measures.
 *
 * The client measurement form is built from this list, so only what is picked
 * here gets asked for. Skippable: the client screen offers the same setup the
 * first time someone's measurements are recorded.
 */
import { useState } from 'preact/hooks'
import { IconCheck } from '../../../components/icons'
import { useShop } from '../../../state/ShopProvider'
import { createMeasurementField } from '../../../db/writes'
import { cn } from '../../../lib/cn'
import { EntryButton, EntryError, EntryForm, EntryHeading, EntryQuietButton } from '../parts'

const SUGGESTED_FIELDS = [
  { label: 'Chest', unit: 'in' },
  { label: 'Waist', unit: 'in' },
  { label: 'Hip', unit: 'in' },
  { label: 'Shoulder', unit: 'in' },
  { label: 'Sleeve length', unit: 'in' },
  { label: 'Trouser length', unit: 'in' },
  { label: 'Neck', unit: 'in' },
  { label: 'Dress length', unit: 'in' },
] as const

export function MeasureStep({ shopId, onDone }: { shopId: string; onDone: () => void }) {
  const { db } = useShop()
  const [chosen, setChosen] = useState<string[]>(['Chest', 'Waist', 'Hip'])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(label: string) {
    setChosen((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    )
  }

  async function finish(fields: readonly string[]) {
    setSaving(true)
    setError(null)
    try {
      await Promise.all(
        fields.map((label, index) => {
          const suggestion = SUGGESTED_FIELDS.find((item) => item.label === label)
          return createMeasurementField(db, shopId, {
            label,
            unit: suggestion?.unit,
            display_order: index,
          })
        }),
      )
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save those fields.')
      setSaving(false)
    }
  }

  return (
    <EntryForm
      actions={
        <>
          <EntryButton disabled={saving || chosen.length === 0} onClick={() => void finish(chosen)}>
            {saving
              ? 'Saving...'
              : `Continue with ${chosen.length} field${chosen.length === 1 ? '' : 's'}`}
          </EntryButton>
          <EntryQuietButton disabled={saving} onClick={() => void finish([])}>
            Skip for now
          </EntryQuietButton>
        </>
      }
    >
      <EntryHeading
        title="What do you measure?"
        body="The client form is built from this list, so only what you pick here gets asked for. Change it any time in Settings."
      />

      {error && <EntryError>{error}</EntryError>}

      <div class="flex flex-wrap gap-2">
        {SUGGESTED_FIELDS.map(({ label }) => {
          const active = chosen.includes(label)
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggle(label)}
              aria-pressed={active}
              class={cn(
                'inline-flex min-h-11 items-center gap-1.5 overflow-hidden rounded-full px-4',
                'text-sm font-medium transition-transform active:scale-[0.97]',
                active ? 'bg-brand-500 text-white' : 'glass text-stone-300',
              )}
            >
              {active && <IconCheck size={15} />}
              {label}
            </button>
          )
        })}
      </div>
    </EntryForm>
  )
}
