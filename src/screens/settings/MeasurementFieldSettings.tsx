/**
 * The measurement field editor (Phase 1 step 3).
 *
 * This is the screen that lets one app serve a suit tailor and a dressmaker
 * without a fork: each shop declares the measurements it actually takes, and
 * the client measurement form is rendered from that list.
 *
 * Built before Clients on purpose -- the measurement form has nothing to
 * render until a shop has configured something here.
 */
import { useMemo, useState } from 'preact/hooks'
import { Button, Card, EmptyState, ErrorNote, Field, Input, Screen } from '../../components/ui'
import { useShop } from '../../state/ShopProvider'
import { useRxQuery } from '../../hooks/useRxQuery'
import {
  createMeasurementField,
  removeMeasurementField,
  reorderMeasurementFields,
} from '../../db/writes'

/**
 * Offered on an empty list so a shop is not staring at a blank screen trying
 * to remember what a measurement list should look like. Starting points, not
 * defaults -- nothing is created without a tap.
 */
const SUGGESTIONS = [
  { label: 'Chest', unit: 'in' },
  { label: 'Waist', unit: 'in' },
  { label: 'Hip', unit: 'in' },
  { label: 'Shoulder', unit: 'in' },
  { label: 'Sleeve length', unit: 'in' },
  { label: 'Trouser length', unit: 'in' },
] as const

export function MeasurementFieldSettings() {
  const { db, shop } = useShop()
  const [label, setLabel] = useState('')
  const [unit, setUnit] = useState('in')
  const [error, setError] = useState<string | null>(null)

  const fieldDocs = useRxQuery(
    () =>
      db.measurement_fields.find({
        selector: { shop_id: shop?.id ?? '__none__' },
        sort: [{ display_order: 'asc' }],
      }).$,
    [db, shop?.id],
    [],
  )

  const fields = useMemo(() => fieldDocs.map((doc) => doc.toJSON()), [fieldDocs])

  if (!shop) {
    return (
      <Screen title="Measurement fields">
        <Card>
          <p class="text-sm text-gray-600">
            The shop record has not reached this device yet. It arrives with the first sync.
          </p>
        </Card>
      </Screen>
    )
  }

  async function add(event: Event) {
    event.preventDefault()
    if (!label.trim()) {
      setError('Give the measurement a name.')
      return
    }
    setError(null)
    try {
      await createMeasurementField(db, shop!.id, {
        label,
        unit,
        display_order: fields.length,
      })
      setLabel('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that field.')
    }
  }

  async function addSuggested(suggestion: (typeof SUGGESTIONS)[number], index: number) {
    await createMeasurementField(db, shop!.id, {
      label: suggestion.label,
      unit: suggestion.unit,
      display_order: index,
    })
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...fields]
    const target = index + direction
    const a = next[index]
    const b = next[target]
    if (!a || !b) return
    next[index] = b
    next[target] = a
    await reorderMeasurementFields(db, next.map((field) => field.id))
  }

  return (
    <Screen title="Measurement fields">
      <div class="space-y-4">
        {fields.length === 0 ? (
          <EmptyState
            title="No fields yet"
            description="Add the measurements you actually take. The client form is built from this list, so only what is here will be asked for."
            action={
              <Button
                onClick={() =>
                  void Promise.all(SUGGESTIONS.map((s, i) => addSuggested(s, i)))
                }
              >
                Start with common ones
              </Button>
            }
          />
        ) : (
          <Card class="!p-0">
            <ul class="divide-y divide-gray-100 px-3">
              {fields.map((field, index) => (
                <li key={field.id} class="flex items-center gap-2 py-2">
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium text-gray-900">{field.label}</span>
                    {field.unit && <span class="block text-xs text-gray-500">{field.unit}</span>}
                  </span>
                  <Button
                    variant="ghost"
                    class="px-2"
                    aria-label={`Move ${field.label} up`}
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    class="px-2"
                    aria-label={`Move ${field.label} down`}
                    disabled={index === fields.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="ghost"
                    class="px-2 text-red-600"
                    aria-label={`Remove ${field.label}`}
                    onClick={() => void removeMeasurementField(db, field.id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <form onSubmit={add} class="space-y-3">
            <h2 class="font-medium text-gray-900">Add a field</h2>
            <div class="flex gap-2">
              <div class="flex-1">
                <Field label="Name">
                  <Input
                    value={label}
                    placeholder="Chest"
                    onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
                  />
                </Field>
              </div>
              <div class="w-24">
                <Field label="Unit">
                  <Input
                    value={unit}
                    placeholder="in"
                    onInput={(e) => setUnit((e.target as HTMLInputElement).value)}
                  />
                </Field>
              </div>
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" class="w-full">
              Add
            </Button>
          </form>
        </Card>

        {fields.length > 0 && (
          <p class="text-xs text-gray-500">
            Removing a field hides it from new forms. Measurements already recorded against it are
            kept, so nothing a client gave you is lost.
          </p>
        )}
      </div>
    </Screen>
  )
}
