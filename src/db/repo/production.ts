/* A run of making, and what it cost. */
import type { PolysterDatabase, Stored } from '../dexie/database'
import type { BatchStatus, CostType, ProductionBatch, ProductionBatchCost } from '../schema'
import { DEFAULT_CURRENCY } from '../../lib/money'
import { newId } from '../../lib/ids'
import {
  insertRow,
  listBy,
  liveQuery,
  loadOrThrow,
  now,
  observeBy,
  observeRow,
  patchRow,
  softDeleteRow,
  sortRows,
  type Observable,
} from './base'

export interface NewBatchInput {
  product_id: string
  batch_number: string
  planned_quantity: number
  notes?: string
}

/** A shop's batches, newest first. */
export function observeProductionBatches(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<ProductionBatch>[]> {
  return observeBy(db.production_batches, 'shop_id', shopId, { key: 'created_at', dir: 'desc' })
}

export function listProductionBatches(
  db: PolysterDatabase,
  shopId: string,
): Promise<Stored<ProductionBatch>[]> {
  return listBy(db.production_batches, 'shop_id', shopId, { key: 'created_at', dir: 'desc' })
}

export function observeProductionBatch(
  db: PolysterDatabase,
  id: string,
): Observable<Stored<ProductionBatch> | null> {
  return observeRow(db.production_batches, id)
}

export async function createProductionBatch(
  db: PolysterDatabase,
  shopId: string,
  input: NewBatchInput,
  staffId?: string,
): Promise<ProductionBatch> {
  const timestamp = now()
  const row: ProductionBatch = {
    id: newId(),
    shop_id: shopId,
    product_id: input.product_id,
    batch_number: input.batch_number.trim(),
    planned_quantity: input.planned_quantity,
    produced_quantity: 0,
    accepted_quantity: 0,
    rejected_quantity: 0,
    status: 'planned',
    started_at: null,
    completed_at: null,
    notes: input.notes?.trim() || null,
    rejected_reason: null,
    created_by: staffId ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  }
  return insertRow(db.production_batches, row, shopId, row.batch_number)
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
  db: PolysterDatabase,
  id: string,
  input: BatchProgressInput,
  previousStatus: BatchStatus,
): Promise<void> {
  if (input.accepted_quantity + input.rejected_quantity > input.produced_quantity) {
    throw new Error('Accepted plus rejected cannot be more than produced.')
  }
  const wasNotStarted = previousStatus === 'planned' || previousStatus === 'materials_ready'
  const nowStarting = input.status !== 'planned' && input.status !== 'materials_ready'
  const timestamp = now()

  await patchRow(
    db.production_batches,
    id,
    {
      status: input.status,
      produced_quantity: input.produced_quantity,
      accepted_quantity: input.accepted_quantity,
      rejected_quantity: input.rejected_quantity,
      rejected_reason: input.rejected_reason?.trim() || null,
      notes: input.notes?.trim() || null,
      ...(wasNotStarted && nowStarting ? { started_at: timestamp } : {}),
      completed_at: input.status === 'completed' ? timestamp : null,
      updated_at: timestamp,
    },
    { label: 'batch', summary: `${previousStatus} to ${input.status}` },
  )
}

// ----------------------------------------------------------------- costs

/** One batch's cost lines, oldest first. */
export function observeBatchCosts(
  db: PolysterDatabase,
  batchId: string,
): Observable<Stored<ProductionBatchCost>[]> {
  return observeBy(db.production_batch_costs, 'batch_id', batchId, { key: 'created_at' })
}

export function listBatchCosts(
  db: PolysterDatabase,
  batchId: string,
): Promise<Stored<ProductionBatchCost>[]> {
  return listBy(db.production_batch_costs, 'batch_id', batchId, { key: 'created_at' })
}

/* Every cost line across every batch, for reporting. production_batch_costs is
   indexed by batch, so a shop-wide list walks the shop's batches. */
export async function listAllBatchCosts(
  db: PolysterDatabase,
  shopId: string,
): Promise<Stored<ProductionBatchCost>[]> {
  const batches = await listBy(db.production_batches, 'shop_id', shopId)
  const perBatch = await Promise.all(
    batches.map((batch) => listBy(db.production_batch_costs, 'batch_id', batch.id)),
  )
  return sortRows(perBatch.flat(), { key: 'created_at' })
}

export function observeAllBatchCosts(
  db: PolysterDatabase,
  shopId: string,
): Observable<Stored<ProductionBatchCost>[]> {
  return liveQuery(() => listAllBatchCosts(db, shopId))
}

export async function addBatchCost(
  db: PolysterDatabase,
  shopId: string,
  batchId: string,
  input: { cost_type: CostType; description?: string; amount_minor: number },
): Promise<ProductionBatchCost> {
  await loadOrThrow(db.production_batches, batchId, 'batch')
  const shop = await db.shops.get(shopId)
  const timestamp = now()

  const row: ProductionBatchCost = {
    id: newId(),
    shop_id: shopId,
    batch_id: batchId,
    cost_type: input.cost_type,
    description: input.description?.trim() || null,
    amount_minor: input.amount_minor,
    currency: shop?.currency ?? DEFAULT_CURRENCY,
    created_at: timestamp,
    updated_at: timestamp,
  }
  return insertRow(db.production_batch_costs, row, shopId, input.cost_type)
}

export async function removeBatchCost(db: PolysterDatabase, id: string): Promise<void> {
  await softDeleteRow(db.production_batch_costs, id)
}

/** Pure. total cost / usable units -- derived figures, never stored. */
export function summarizeBatchCosts(
  costs: readonly Pick<ProductionBatchCost, 'amount_minor'>[],
  usableUnits: number,
) {
  const totalMinor = costs.reduce((sum, cost) => sum + cost.amount_minor, 0)
  return {
    totalMinor,
    usableUnits,
    costPerUnitMinor: usableUnits > 0 ? Math.round(totalMinor / usableUnits) : null,
  }
}
