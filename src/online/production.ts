/** Production batches and costing. Online-only, see catalogue.ts's header comment for why. */
import { getSupabase } from '../lib/supabaseClient'
export { BATCH_STATUSES, COST_TYPES } from '../db/schema'
export type { BatchStatus, CostType, ProductionBatch, ProductionBatchCost } from '../db/schema'
import type { BatchStatus, CostType, ProductionBatch, ProductionBatchCost } from '../db/schema'
import { friendlyError } from './friendlyError'

export interface NewBatchInput {
  product_id: string
  batch_number: string
  planned_quantity: number
  notes?: string
}

export async function listProductionBatches(shopId: string): Promise<ProductionBatch[]> {
  const { data, error } = await getSupabase()
    .from('production_batches')
    .select()
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
  if (error) throw friendlyError(error)
  return data
}

export async function getProductionBatch(id: string): Promise<ProductionBatch | null> {
  const { data, error } = await getSupabase().from('production_batches').select().eq('id', id).maybeSingle()
  if (error) throw friendlyError(error)
  return data
}

export async function createProductionBatch(shopId: string, input: NewBatchInput, staffId?: string): Promise<ProductionBatch> {
  const { data, error } = await getSupabase()
    .from('production_batches')
    .insert({
      shop_id: shopId,
      product_id: input.product_id,
      batch_number: input.batch_number.trim(),
      planned_quantity: input.planned_quantity,
      notes: input.notes?.trim() || null,
      created_by: staffId ?? null,
    })
    .select()
    .single()
  if (error) throw friendlyError(error)
  return data
}

export interface BatchProgressInput {
  status: BatchStatus
  produced_quantity: number
  accepted_quantity: number
  rejected_quantity: number
  rejected_reason?: string
  notes?: string
}

/* started_at is set the first time a batch leaves planned, never overwritten.
   completed_at follows status directly. */
export async function updateBatchProgress(
  id: string,
  input: BatchProgressInput,
  previousStatus: BatchStatus,
): Promise<void> {
  if (input.accepted_quantity + input.rejected_quantity > input.produced_quantity) {
    throw new Error('Accepted plus rejected cannot be more than produced.')
  }
  const wasNotStarted = previousStatus === 'planned' || previousStatus === 'materials_ready'
  const nowStarting = input.status !== 'planned' && input.status !== 'materials_ready'

  const { error } = await getSupabase()
    .from('production_batches')
    .update({
      status: input.status,
      produced_quantity: input.produced_quantity,
      accepted_quantity: input.accepted_quantity,
      rejected_quantity: input.rejected_quantity,
      rejected_reason: input.rejected_reason?.trim() || null,
      notes: input.notes?.trim() || null,
      ...(wasNotStarted && nowStarting ? { started_at: new Date().toISOString() } : {}),
      completed_at: input.status === 'completed' ? new Date().toISOString() : null,
    })
    .eq('id', id)
  if (error) throw friendlyError(error)
}

export async function listBatchCosts(batchId: string): Promise<ProductionBatchCost[]> {
  const { data, error } = await getSupabase()
    .from('production_batch_costs')
    .select()
    .eq('batch_id', batchId)
    .order('created_at')
  if (error) throw friendlyError(error)
  return data
}

/** Every cost line across every batch in the shop -- for reporting (Phase 11), not a single batch's detail page. */
export async function listAllBatchCosts(shopId: string): Promise<ProductionBatchCost[]> {
  const { data, error } = await getSupabase()
    .from('production_batch_costs')
    .select()
    .eq('shop_id', shopId)
  if (error) throw friendlyError(error)
  return data
}

export async function addBatchCost(
  shopId: string,
  batchId: string,
  input: { cost_type: CostType; description?: string; amount_minor: number },
): Promise<ProductionBatchCost> {
  const { data, error } = await getSupabase()
    .from('production_batch_costs')
    .insert({
      shop_id: shopId,
      batch_id: batchId,
      cost_type: input.cost_type,
      description: input.description?.trim() || null,
      amount_minor: input.amount_minor,
    })
    .select()
    .single()
  if (error) throw friendlyError(error)
  return data
}

export async function removeBatchCost(id: string): Promise<void> {
  const { error } = await getSupabase().from('production_batch_costs').delete().eq('id', id)
  if (error) throw friendlyError(error)
}

/** Pure. total cost / usable units -- section 23's derived figures, never stored. */
export function summarizeBatchCosts(costs: readonly Pick<ProductionBatchCost, 'amount_minor'>[], usableUnits: number) {
  const totalMinor = costs.reduce((sum, c) => sum + c.amount_minor, 0)
  return {
    totalMinor,
    usableUnits,
    costPerUnitMinor: usableUnits > 0 ? Math.round(totalMinor / usableUnits) : null,
  }
}
