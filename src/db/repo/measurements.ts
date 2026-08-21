import type { PolysterDatabase, Stored } from '../dexie/database'
import type { MeasurementFieldDoc, MeasurementFieldType, MeasurementProfileDoc } from '../schema'
import { newId } from '../../lib/ids'
import {
  insertRow,
  liveQuery,
  listBy,
  loadOrThrow,
  now,
  observeOneBy,
  patchRow,
  sortRows,
  type Observable,
} from './base'
import { updateOrderUnit } from './orderUnits'

// ----------------------------------------------------------------- fields

function fieldsOf(
  db: PolysterDatabase,
  shopId: string,
  wanted: 'active' | 'retired' | 'all',
): Observable<Stored<MeasurementFieldDoc>[]> {
  return liveQuery(async () => {
    const rows = await listBy(db.measurement_fields, 'shop_id', shopId)
    // A field with no `active` flag counts as active, matching the backfill.
    const kept =
      wanted === 'all' ? rows : rows.filter((row) => (row.active !== false) === (wanted === 'active'))
    return sortRows(kept, { key: 'display_order' })
  })
}

/** The fields a new form offers. */
export function observeActiveMeasurementFields(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<MeasurementFieldDoc>[]> {
  return fieldsOf(db, shopId, 'active')
}

/** Retired fields, so values already recorded against them can still be shown. */
export function observeRetiredMeasurementFields(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<MeasurementFieldDoc>[]> {
  return fieldsOf(db, shopId, 'retired')
}

export function observeMeasurementFields(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<MeasurementFieldDoc>[]> {
  return fieldsOf(db, shopId, 'all')
}

export async function createMeasurementField(
  db: PolysterDatabase,
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
    field_type: input.field_type ?? 'number',
    active: true,
    created_at: timestamp,
    updated_at: timestamp,
    ...(input.unit?.trim() ? { unit: input.unit.trim() } : {}),
    ...(input.group_label?.trim() ? { group_label: input.group_label.trim() } : {}),
  }
  return insertRow(db.measurement_fields, doc, shopId, doc.label)
}

export async function reorderMeasurementFields(
  db: PolysterDatabase,
  orderedIds: readonly string[],
): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    if (await db.measurement_fields.get(id)) {
      await patchRow(db.measurement_fields, id, { display_order: index, updated_at: now() })
    }
  }
}

/* Retired, not deleted: values recorded against a field still need its label
   to be readable. */
export async function retireMeasurementField(
  db: PolysterDatabase,
  fieldId: string,
): Promise<void> {
  await setFieldActive(db, fieldId, false)
}

/** Undoes retireMeasurementField -- a field can be brought back into new forms. */
export async function reactivateMeasurementField(
  db: PolysterDatabase,
  fieldId: string,
): Promise<void> {
  await setFieldActive(db, fieldId, true)
}

async function setFieldActive(
  db: PolysterDatabase,
  fieldId: string,
  active: boolean,
): Promise<void> {
  if (!(await db.measurement_fields.get(fieldId))) return
  await patchRow(db.measurement_fields, fieldId, { active, updated_at: now() })
}

// --------------------------------------------------------------- profiles

/** A client's saved measurements, or null when they have none yet. */
export function observeMeasurementProfile(
  db: PolysterDatabase,
  clientId: string,
): Observable<Stored<MeasurementProfileDoc> | null> {
  return observeOneBy(db.measurement_profiles, 'client_id', clientId)
}

export async function saveMeasurements(
  db: PolysterDatabase,
  clientId: string,
  values: Record<string, string | number>,
  staffId?: string,
): Promise<void> {
  const client = await loadOrThrow(db.clients, clientId, 'client')
  const existing = (await listBy(db.measurement_profiles, 'client_id', clientId))[0]

  if (existing) {
    await patchRow(db.measurement_profiles, existing.id, {
      values,
      updated_at: now(),
      updated_by: staffId,
    }, { shopId: client.shop_id })
    return
  }

  const timestamp = now()
  await insertRow(
    db.measurement_profiles,
    {
      id: newId(),
      client_id: clientId,
      values,
      created_at: timestamp,
      updated_at: timestamp,
      ...(staffId ? { updated_by: staffId } : {}),
    },
    client.shop_id,
    client.name,
  )
}

/* Copies a client's profile onto a unit's frozen snapshot. One-way: a later
   profile edit must never reach back. A no-op when there is no profile. */
export async function copyMeasurementsFromClient(
  db: PolysterDatabase,
  unitId: string,
  clientId: string,
): Promise<void> {
  const profile = (await listBy(db.measurement_profiles, 'client_id', clientId))[0]
  if (!profile) return
  await updateOrderUnit(db, unitId, { measurements: profile.values })
}

/* The reverse direction: a unit's snapshot up to the client's profile. Reuses
   saveMeasurements so create-or-update lives in one place. */
export async function saveUnitMeasurementsToClient(
  db: PolysterDatabase,
  unitId: string,
  clientId: string,
  staffId?: string,
): Promise<void> {
  const unit = await loadOrThrow(db.order_units, unitId, 'item')
  await saveMeasurements(db, clientId, unit.measurements, staffId)
}
