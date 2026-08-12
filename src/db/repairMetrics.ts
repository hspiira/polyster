/**
 * Repair metrics (Phase 11, section 82). Cash accounting for revenue, same
 * principle as profit.ts -- a quoted repair that hasn't been paid for is not
 * yet revenue. Turnaround is measured only on repairs that have actually
 * reached 'picked_up' -- an in-flight repair has no turnaround yet, not a
 * zero one.
 */
import { signedAmountMinor } from './balances'
import type { OrderDoc, PaymentDoc } from './schema'

export interface RepairMetrics {
  totalCount: number
  openCount: number
  completedCount: number
  cancelledCount: number
  paidMinor: number
  averageTurnaroundDays: number | null
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

export function repairMetrics(
  orders: readonly OrderDoc[],
  payments: readonly PaymentDoc[],
): RepairMetrics {
  const repairs = orders.filter((order) => order.order_type === 'repair')
  const repairOrderIds = new Set(repairs.map((order) => order.id))

  let completedCount = 0
  let cancelledCount = 0
  let turnaroundDaysTotal = 0
  let turnaroundCount = 0

  for (const repair of repairs) {
    if (repair.stage === 'cancelled') {
      cancelledCount++
    } else if (repair.stage === 'picked_up') {
      completedCount++
      if (repair.picked_up_at) {
        const days = (Date.parse(repair.picked_up_at) - Date.parse(repair.created_at)) / MS_PER_DAY
        turnaroundDaysTotal += days
        turnaroundCount++
      }
    }
  }

  let paidMinor = 0
  for (const payment of payments) {
    if (repairOrderIds.has(payment.order_id)) paidMinor += signedAmountMinor(payment)
  }

  return {
    totalCount: repairs.length,
    openCount: repairs.length - completedCount - cancelledCount,
    completedCount,
    cancelledCount,
    paidMinor,
    averageTurnaroundDays: turnaroundCount > 0 ? turnaroundDaysTotal / turnaroundCount : null,
  }
}
