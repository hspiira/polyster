/**
 * The measurement field editor (Phase 1 step 3).
 *
 * This is the screen that lets one app serve a suit tailor and a dressmaker
 * without a fork: each shop declares the measurements it takes, and the client
 * measurement form is rendered from that list.
 *
 * Built before Clients on purpose -- the measurement form has nothing to
 * render until a shop has configured something here.
 */
import { useMemo, useState } from 'preact/hooks'
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  InfoNote,
  Input,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
} from '../../ui'
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '../../components/icons'
import { IllustrationMeasure } from '../../components/illustrations'
import { useShop } from '../../state/ShopProvider'
import { useRxQuery } from '../../hooks/useRxQuery'
import {
  createMeasurementField,
  reactivateMeasurementField,
  retireMeasurementField,
  reorderMeasurementFields,
} from '../../db/writes'
import { MEASUREMENT_FIELD_TYPES, type MeasurementFieldType } from '../../db/schema'
import { useBack } from '../../hooks/useBack'

const FIELD_TYPE_LABELS: Record<MeasurementFieldType, string> = {
  number: 'Number',
  text: 'Text',
}

/**
 * Offered on an empty list so a shop is not staring at a blank screen trying
 * to remember what a measurement list looks like. Starting points, not
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
  const back = useBack()
  const { db, shop } = useShop()
  const [label, setLabel] = useState('')
  const [unit, setUnit] = useState('in')
  const [fieldType, setFieldType] = useState<MeasurementFieldType>('number')
  const [group, setGroup] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

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
  // Retired fields stay visible here (with a restore control) rather than
  // vanishing, since nothing elsewhere lets a shop see or undo a retirement.
  const activeFields = useMemo(() => fields.filter((field) => field.active !== false), [fields])
  const retiredFields = useMemo(() => fields.filter((field) => field.active === false), [fields])

  if (!shop) {
    return (
      <Screen title="Measurement fields" back={back}>
        <Card>
          <p class="text-sm text-content-muted">
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
        field_type: fieldType,
        group_label: group,
      })
      setLabel('')
      setGroup('')
      setAdding(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that field.')
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...activeFields]
    const target = index + direction
    const a = next[index]
    const b = next[target]
    if (!a || !b) return
    next[index] = b
    next[target] = a
    await reorderMeasurementFields(db, next.map((field) => field.id))
  }

  return (
    <Screen
      title="Measurements"
      subtitle={fields.length > 0 ? `${fields.length} fields` : undefined}
      back={back}
      action={
        fields.length > 0 && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <IconPlus size={16} /> Add
          </Button>
        )
      }
    >
      <div class="space-y-4">
        {fields.length === 0 ? (
          <EmptyState
            spacious
            illustration={<IllustrationMeasure size={112} />}
            title="No fields yet"
            description="Add the measurements you actually take. The client form is built from this list, so only what is here will be asked for."
            action={
              <div class="flex flex-col gap-2">
                <Button
                  onClick={() =>
                    void Promise.all(
                      SUGGESTIONS.map((s, i) =>
                        createMeasurementField(db, shop.id, {
                          label: s.label,
                          unit: s.unit,
                          display_order: i,
                        }),
                      ),
                    )
                  }
                >
                  Start with common ones
                </Button>
                <Button variant="secondary" onClick={() => setAdding(true)}>
                  Add one myself
                </Button>
              </div>
            }
          />
        ) : (
          <>
            {activeFields.length > 0 && (
              <Card padded={false}>
                <ul>
                  {activeFields.map((field, index) => (
                    <li key={field.id} class="flex items-center gap-1 px-3 py-2.5">
                      <span class="min-w-0 flex-1 pl-1">
                        <span class="block truncate font-medium">{field.label}</span>
                        {(field.unit || field.field_type === 'text' || field.group_label) && (
                          <span class="block text-xs text-content-muted">
                            {[
                              field.unit,
                              // 'number' is the common case; naming it every time would be noise.
                              field.field_type === 'text' ? FIELD_TYPE_LABELS.text : null,
                              field.group_label,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move ${field.label} up`}
                        disabled={index === 0}
                        onClick={() => void move(index, -1)}
                      >
                        <IconArrowUp size={18} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move ${field.label} down`}
                        disabled={index === activeFields.length - 1}
                        onClick={() => void move(index, 1)}
                      >
                        <IconArrowDown size={18} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="text-danger"
                        aria-label={`Retire ${field.label}`}
                        onClick={() => void retireMeasurementField(db, field.id)}
                      >
                        <IconTrash size={18} />
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {retiredFields.length > 0 && (
              <div>
                <SectionTitle>Retired</SectionTitle>
                <Card padded={false}>
                  <ul>
                    {retiredFields.map((field) => (
                      <li key={field.id} class="flex items-center gap-1 px-3 py-2.5">
                        <span class="min-w-0 flex-1 pl-1">
                          <span class="block truncate text-content-muted">{field.label}</span>
                          {field.unit && (
                            <span class="block text-xs text-content-subtle">{field.unit}</span>
                          )}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Restore ${field.label}`}
                          onClick={() => void reactivateMeasurementField(db, field.id)}
                        >
                          Restore
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            )}
          </>
        )}

        {fields.length > 0 && (
          <InfoNote>
            Removing a field hides it from new forms. Measurements already recorded against it are
            kept, so nothing a client gave you is lost.
          </InfoNote>
        )}
      </div>

      <Sheet open={adding} title="Add a measurement" onClose={() => setAdding(false)}>
        <form onSubmit={add} class="space-y-4">
          <div class="flex gap-3">
            <div class="flex-1">
              <Field label="Name">
                <Input
                  value={label}
                  autofocus
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

          <Field label="Type">
            <Segmented
              value={fieldType}
              options={MEASUREMENT_FIELD_TYPES.map((value) => ({
                value,
                label: FIELD_TYPE_LABELS[value],
              }))}
              onChange={setFieldType}
              label="Field type"
            />
          </Field>

          <Field label="Group" hint="Optional -- e.g. 'Upper body'. For display only.">
            <Input
              value={group}
              placeholder="Optional"
              onInput={(e) => setGroup((e.target as HTMLInputElement).value)}
            />
          </Field>

          {error && <ErrorNote>{error}</ErrorNote>}
          <div class="flex gap-2 pt-1">
            <Button variant="secondary" class="flex-1" type="button" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button class="flex-1" type="submit">
              Add
            </Button>
          </div>
        </form>
      </Sheet>
    </Screen>
  )
}
