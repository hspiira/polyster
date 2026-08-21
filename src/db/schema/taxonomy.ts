/* Lists a shop defines for itself, like measurement_fields. */
import type { RxJsonSchema } from 'rxdb'
import { idField } from './shared'

export interface ShopTaxonomyDoc {
  id: string
  shop_id: string
  label: string
  active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

function taxonomySchema(): RxJsonSchema<ShopTaxonomyDoc> {
  return {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: {
      id: idField,
      shop_id: idField,
      label: { type: 'string' },
      active: { type: 'boolean' },
      display_order: { type: 'number' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
    required: ['id', 'shop_id', 'label', 'active', 'display_order'],
    indexes: ['shop_id'],
  }
}

export const expenseCategorySchema = taxonomySchema()
export const materialTypeSchema = taxonomySchema()
