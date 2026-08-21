import type { RxJsonSchema } from 'rxdb'
import { uuidField } from './shared'

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
export const shopSchema: RxJsonSchema<ShopDoc> = {
  version: 3, // v3: business_type, logo_url, timezone, email, website
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    name: { type: 'string' },
    whatsapp_number: { type: 'string' },
    supabase_auth_user_id: uuidField,
    currency: { type: 'string' },
    country: { type: 'string' },
    address: { type: 'string' },
    lock_after_minutes: { type: 'integer', minimum: 0 },
    business_type: { type: 'string', enum: [...BUSINESS_TYPES] },
    logo_url: { type: 'string' },
    timezone: { type: 'string' },
    email: { type: 'string' },
    website: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'name', 'currency', 'country', 'lock_after_minutes'],
}
