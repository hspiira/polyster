/* Lists a shop defines for itself, like measurement_fields. */

export interface ShopTaxonomyDoc {
  id: string
  shop_id: string
  label: string
  active: boolean
  display_order: number
  created_at: string
  updated_at: string
}
