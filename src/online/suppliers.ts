/** Suppliers. Online-only, see catalogue.ts's header comment for why. */
import { getSupabase } from '../lib/supabaseClient'
import { friendlyError } from './friendlyError'

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

export interface SupplierInput {
  name: string
  phone?: string
  email?: string
  address?: string
  notes?: string
}

export async function listSuppliers(shopId: string): Promise<Supplier[]> {
  const { data, error } = await getSupabase()
    .from('suppliers')
    .select()
    .eq('shop_id', shopId)
    .order('name')
  if (error) throw friendlyError(error)
  return data
}

export async function createSupplier(shopId: string, input: SupplierInput): Promise<Supplier> {
  const { data, error } = await getSupabase()
    .from('suppliers')
    .insert({
      shop_id: shopId,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select()
    .single()
  if (error) throw friendlyError(error)
  return data
}

export async function updateSupplier(id: string, input: SupplierInput): Promise<void> {
  const { error } = await getSupabase()
    .from('suppliers')
    .update({
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .eq('id', id)
  if (error) throw friendlyError(error)
}

export async function setSupplierActive(id: string, active: boolean): Promise<void> {
  const { error } = await getSupabase().from('suppliers').update({ active }).eq('id', id)
  if (error) throw friendlyError(error)
}
