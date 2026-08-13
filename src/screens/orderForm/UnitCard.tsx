import { Button, Card, Disclosure, Field, Input, Segmented } from '../../ui'
import { IconTrash } from '../../components/icons'
import { FABRIC_SOURCES, type MeasurementFieldDoc } from '../../db/schema'
import { FABRIC_SOURCE_LABELS } from '../orderStage'
import type { UnitDraft, UnitFieldKey } from '../orderFormModel'
import { MeasurementsBlock } from './MeasurementsBlock'

export function UnitCard({
  index,
  unit,
  currency,
  canRemove,
  activeFields,
  retiredFields,
  clientId,
  clientName,
  showMeasurements,
  hasClientProfile,
  errorFor,
  onChange,
  onRemove,
  onCopyFromClient,
  onSaveToClient,
}: {
  index: number
  unit: UnitDraft
  currency: string
  canRemove: boolean
  activeFields: MeasurementFieldDoc[]
  retiredFields: MeasurementFieldDoc[]
  clientId: string
  clientName: string
  /** Only where something is made or altered to fit. */
  showMeasurements: boolean
  hasClientProfile: boolean
  errorFor: (field: UnitFieldKey) => string | null
  onChange: (patch: Partial<UnitDraft>) => void
  onRemove: () => void
  onCopyFromClient: () => void
  onSaveToClient: () => void
}) {
  const retiredWithValue = retiredFields.filter((field) => unit.measurements[field.id] !== undefined)
  const filledMeasurements = Object.values(unit.measurements).filter((v) => v.trim()).length
  const detailSummary = [
    unit.wearer_name.trim() || null,
    FABRIC_SOURCE_LABELS[unit.fabric_source],
    filledMeasurements > 0 ? `${filledMeasurements} measured` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card flush>
      <div class="mb-3 flex items-center justify-between gap-2">
        <p class="text-sm font-semibold text-content-muted">Item {index + 1}</p>
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            class="text-danger"
            aria-label={`Remove ${unit.item_description || `item ${index + 1}`}`}
            onClick={onRemove}
          >
            <IconTrash size={18} />
          </Button>
        )}
      </div>

      <div class="space-y-4">
        <Field label="Description" error={errorFor('item_description')}>
          <Input
            value={unit.item_description}
            placeholder="Navy two-piece suit"
            onInput={(e) => onChange({ item_description: (e.target as HTMLInputElement).value })}
          />
        </Field>

        <Field label="Price" hint={`Amount in ${currency}.`} error={errorFor('price')}>
          <Input
            inputmode="decimal"
            placeholder="0"
            value={unit.price}
            onInput={(e) => onChange({ price: (e.target as HTMLInputElement).value })}
          />
        </Field>

        {/* Measurements are the point of a tailored item, so they sit on the card
            rather than behind a disclosure. A rental or a shelf purchase is not
            being made to fit, so it does not ask. */}
        {showMeasurements && (activeFields.length > 0 || retiredWithValue.length > 0) && (
          <MeasurementsBlock
            fields={activeFields}
            retiredWithValue={retiredWithValue}
            values={unit.measurements}
            clientId={clientId}
            clientName={clientName}
            hasClientProfile={hasClientProfile}
            onChangeField={(fieldId, value) =>
              onChange({ measurements: { ...unit.measurements, [fieldId]: value } })
            }
            onCopyFromClient={onCopyFromClient}
            onSaveToClient={onSaveToClient}
          />
        )}

        <Disclosure label="Wearer and fabric" summary={detailSummary}>
          <Field label="Wearer" hint="Who this is for, if not the client themselves.">
            <Input
              value={unit.wearer_name}
              placeholder="Optional"
              onInput={(e) => onChange({ wearer_name: (e.target as HTMLInputElement).value })}
            />
          </Field>

          <Field label="Fabric">
            <Segmented
              value={unit.fabric_source}
              options={FABRIC_SOURCES.map((value) => ({ value, label: FABRIC_SOURCE_LABELS[value] }))}
              onChange={(fabric_source) => onChange({ fabric_source })}
              label="Fabric source"
            />
          </Field>
        </Disclosure>
      </div>
    </Card>
  )
}
