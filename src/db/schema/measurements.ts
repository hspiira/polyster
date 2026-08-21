
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

export interface MeasurementProfileDoc {
  id: string
  /** One profile per client -- enforced by a unique constraint in Postgres. */
  client_id: string
  values: Record<string, string | number>
  created_at: string
  updated_at: string
  updated_by?: string
}
