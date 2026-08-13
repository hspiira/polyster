import type { AppDatabase } from '../database'
import {
  type MeasurementFieldDoc,
  type MeasurementFieldType,
} from '../schema'
import { newId, now, loadOrThrow } from './shared'
import { updateOrderUnit } from './orderUnits'

// ----------------------------------------------------------- measurements

export async function saveMeasurements(
  db: AppDatabase,
  clientId: string,
  values: Record<string, string | number>,
  staffId?: string,
): Promise<void> {
  const existing = await db.measurement_profiles.findOne({ selector: { client_id: clientId } }).exec()

  if (existing) {
    await existing.patch({ values, updated_at: now(), updated_by: staffId })
    return
  }

  const timestamp = now()
  await db.measurement_profiles.insert({
    id: newId(),
    client_id: clientId,
    values,
    created_at: timestamp,
    updated_at: timestamp,
    ...(staffId ? { updated_by: staffId } : {}),
  })
}

export async function createMeasurementField(
  db: AppDatabase,
  shopId: string,
  input: {
    label: string
    unit?: string
    display_order: number
    field_type?: MeasurementFieldType
    group_label?: string
  },
): Promise<MeasurementFieldDoc> {
  const timestamp = now()
  const doc: MeasurementFieldDoc = {
    id: newId(),
    shop_id: shopId,
    label: input.label.trim(),
    display_order: input.display_order,
    // Existing callers predate the type distinction; 'number' matches the
    // migration's own backfill default.
    field_type: input.field_type ?? 'number',
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.unit?.trim() ? { unit: input.unit.trim() } : {}),
    ...(input.group_label?.trim() ? { group_label: input.group_label.trim() } : {}),
  }
  await db.measurement_fields.insert(doc)
  return doc
}

export async function reorderMeasurementFields(
  db: AppDatabase,
  orderedIds: readonly string[],
): Promise<void> {
  await Promise.all(
    orderedIds.map(async (id, index) => {
      const doc = await db.measurement_fields.findOne(id).exec()
      await doc?.patch({ display_order: index })
    }),
  )
}

export async function retireMeasurementField(db: AppDatabase, fieldId: string): Promise<void> {
  // Patched, not removed: doc.remove() is a soft delete that RxDB excludes
  // from query results, which would make recorded values unlabellable.
  const doc = await db.measurement_fields.findOne(fieldId).exec()
  await doc?.patch({ active: false, updated_at: now() })
}

/** Undoes retireMeasurementField -- a field can be brought back into new forms. */
export async function reactivateMeasurementField(db: AppDatabase, fieldId: string): Promise<void> {
  const doc = await db.measurement_fields.findOne(fieldId).exec()
  await doc?.patch({ active: true, updated_at: now() })
}

/* Copies a client's profile onto a unit's frozen snapshot. One-way: a later
   profile edit must never reach back. A no-op when there is no profile. */
export async function copyMeasurementsFromClient(
  db: AppDatabase,
  unitId: string,
  clientId: string,
): Promise<void> {
  const profile = await db.measurement_profiles.findOne({ selector: { client_id: clientId } }).exec()
  if (!profile) return
  await updateOrderUnit(db, unitId, { measurements: profile.toJSON().values })
}

/* The reverse direction: a unit's snapshot up to the client's profile. Reuses
   saveMeasurements so create-or-update lives in one place. */
export async function saveUnitMeasurementsToClient(
  db: AppDatabase,
  unitId: string,
  clientId: string,
  staffId?: string,
): Promise<void> {
  const unit = await loadOrThrow(db, 'order_units', unitId, 'item')
  await saveMeasurements(db, clientId, unit.toJSON().measurements, staffId)
}
