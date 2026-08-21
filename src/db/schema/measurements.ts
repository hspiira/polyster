import type { RxJsonSchema } from 'rxdb'
import { uuidField } from './shared'

export const MEASUREMENT_FIELD_TYPES = ['number', 'text'] as const
export type MeasurementFieldType = (typeof MEASUREMENT_FIELD_TYPES)[number]

export interface MeasurementFieldDoc {
  id: string
  shop_id: string
  label: string
  unit?: string
  display_order: number
  field_type: MeasurementFieldType
  /** Display grouping only, no logic. */
  group_label?: string
  /** Retiring a field sets this false; `_deleted` returns to meaning deleted. */
  active: boolean
  created_at: string
  updated_at: string
}
export const measurementFieldSchema: RxJsonSchema<MeasurementFieldDoc> = {
  version: 1, // v1: field_type, group_label, active, created_at, updated_at
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    label: { type: 'string' },
    unit: { type: 'string' },
    display_order: { type: 'number' },
    field_type: { type: 'string', enum: [...MEASUREMENT_FIELD_TYPES] },
    group_label: { type: 'string' },
    active: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shop_id', 'label', 'display_order', 'field_type', 'active'],
  indexes: ['shop_id'],
}

export interface MeasurementProfileDoc {
  id: string
  /** One profile per client -- enforced by a unique constraint in Postgres. */
  client_id: string
  values: Record<string, string | number>
  created_at: string
  updated_at: string
  updated_by?: string
}
export const measurementProfileSchema: RxJsonSchema<MeasurementProfileDoc> = {
  version: 1, // v1: created_at
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    client_id: uuidField,
    values: { type: 'object', additionalProperties: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    updated_by: uuidField,
  },
  required: ['id', 'client_id', 'values'],
  indexes: ['client_id'],
}
