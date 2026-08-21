
/** ISO 3166-1 alpha-2. Replaces the hardcoded dialling prefix as the default. */
export const DEFAULT_COUNTRY = 'UG'

/** Affects defaults and navigation only, never a permission boundary. */
export const BUSINESS_TYPES = [
  'tailor',
  'rental',
  'apparel_brand',
  'corporate_supplier',
  'hybrid',
] as const
export type BusinessType = (typeof BUSINESS_TYPES)[number]

export interface ShopDoc {
  id: string
  name: string
  whatsapp_number?: string
  /** Unset until linked to a live Supabase session; never syncs until then. */
  supabase_auth_user_id?: string
  /** ISO 4217, snapshotted onto each order at creation. */
  currency: string
  country: string
  address?: string
  /** 0 means never. */
  lock_after_minutes: number
  business_type?: BusinessType
  logo_url?: string
  /** IANA zone name, e.g. "Africa/Kampala". Display only. */
  timezone?: string
  email?: string
  website?: string
  created_at: string
  updated_at: string
}
