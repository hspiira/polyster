import type { RxJsonSchema } from 'rxdb'
import { uuidField } from './shared'

export interface ClientDoc {
  id: string
  shop_id: string
  name: string
  phone?: string
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}
export const clientSchema: RxJsonSchema<ClientDoc> = {
  version: 1, // v1: created_by, updated_at
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    name: { type: 'string' },
    phone: { type: 'string' },
    notes: { type: 'string' },
    created_by: uuidField,
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shop_id', 'name'],
  indexes: ['shop_id'],
}
