/* Who materials are bought from. */

export interface Supplier {
  id: string
  shop_id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}
