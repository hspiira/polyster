import { useMemo } from 'preact/hooks'
import { Field, Input } from '../../ui'
import type { MeasurementFieldDoc } from '../../db/schema'

export function MeasurementsBlock({
  fields,
  retiredWithValue,
  values,
  clientId,
  clientName,
  hasClientProfile,
  onChangeField,
  onCopyFromClient,
  onSaveToClient,
}: {
  fields: MeasurementFieldDoc[]
  retiredWithValue: MeasurementFieldDoc[]
  values: Record<string, string>
  clientId: string
  clientName: string
  hasClientProfile: boolean
  onChangeField: (fieldId: string, value: string) => void
  onCopyFromClient: () => void
  onSaveToClient: () => void
}) {
  // Fields with no group sort first, then each named group -- a display
  // grouping only, never a reordering of the shop's own field order.
  const groups = useMemo(() => {
    const byGroup = new Map<string, MeasurementFieldDoc[]>()
    for (const field of fields) {
      const key = field.group_label ?? ''
      const bucket = byGroup.get(key)
      if (bucket) bucket.push(field)
      else byGroup.set(key, [field])
    }
    return [...byGroup.entries()]
  }, [fields])

  return (
    <div class="space-y-3 border-t border-line pt-4">
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p class="text-sm font-medium text-content">Measurements</p>
        {clientId && (
          <div class="flex flex-wrap gap-x-3 gap-y-1">
            {hasClientProfile && (
              <button
                type="button"
                onClick={onCopyFromClient}
                class="text-xs font-semibold text-accent"
              >
                Copy from {clientName}'s measurements
              </button>
            )}
            <button
              type="button"
              onClick={onSaveToClient}
              class="text-xs font-semibold text-accent"
            >
              Save to {clientName}'s measurements
            </button>
          </div>
        )}
      </div>

      {/* copyMeasurementsFromClient is a no-op with no profile to copy --
          the button must not imply otherwise, so it is hidden rather than
          shown disabled. */}
      {clientId && !hasClientProfile && (
        <p class="text-xs text-content-muted">
          {clientName} has no saved measurements yet -- nothing to copy in.
        </p>
      )}

      {groups.map(([group, groupFields]) => (
        <div key={group || '_ungrouped'} class="space-y-3">
          {group && (
            <p class="text-xs font-semibold tracking-wide text-content-subtle uppercase">
              {group}
            </p>
          )}
          <div class="grid grid-cols-2 gap-3">
            {groupFields.map((field) => (
              <Field key={field.id} label={field.unit ? `${field.label} (${field.unit})` : field.label}>
                <Input
                  inputmode={field.field_type === 'text' ? undefined : 'decimal'}
                  placeholder="—"
                  value={values[field.id] ?? ''}
                  onInput={(e) => onChangeField(field.id, (e.target as HTMLInputElement).value)}
                />
              </Field>
            ))}
          </div>
        </div>
      ))}

      {retiredWithValue.length > 0 && (
        <div class="grid grid-cols-2 gap-3">
          {retiredWithValue.map((field) => (
            <Field
              key={field.id}
              label={`${field.unit ? `${field.label} (${field.unit})` : field.label} (retired)`}
            >
              <Input value={values[field.id] ?? ''} disabled readOnly />
            </Field>
          ))}
        </div>
      )}
    </div>
  )
}
