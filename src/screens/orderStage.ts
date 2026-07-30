/**
 * How order stages and types are presented, in one place so a stage never
 * reads as "in_progress" on one screen and "In progress" on another.
 */
import type { ChipTone } from '../components/ui'
import type { OrderStage, OrderType, PaymentMethod } from '../db/schema'

export const STAGE_LABELS: Record<OrderStage, string> = {
  measured: 'Measured',
  in_progress: 'In progress',
  ready: 'Ready',
  picked_up: 'Picked up',
  returned: 'Returned',
}

export const STAGE_TONES: Record<OrderStage, ChipTone> = {
  measured: 'neutral',
  in_progress: 'info',
  ready: 'good',
  picked_up: 'neutral',
  returned: 'neutral',
}

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  tailor_made: 'Tailor-made',
  rental: 'Rental',
  purchase: 'Purchase',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile money',
  bank: 'Bank',
  other: 'Other',
}

/**
 * The stages an order of each type actually passes through.
 *
 * A tailor-made garment is never "returned" -- the client keeps it. A rental
 * is. Showing every stage for every type would put a button on screen that
 * makes no sense for the order in front of you, which is how bad data gets
 * entered.
 */
const FLOWS: Record<OrderType, readonly OrderStage[]> = {
  tailor_made: ['measured', 'in_progress', 'ready', 'picked_up'],
  purchase: ['measured', 'ready', 'picked_up'],
  rental: ['measured', 'ready', 'picked_up', 'returned'],
}

export function stagesFor(orderType: OrderType): readonly OrderStage[] {
  return FLOWS[orderType]
}

/**
 * The next stage in the flow, or null at the end.
 *
 * Returns the flow's first stage if the current one is not in it -- which
 * happens when an order's type is changed after the fact, and is better than
 * leaving the shop with no way forward.
 */
export function nextStage(orderType: OrderType, current: OrderStage): OrderStage | null {
  const flow = stagesFor(orderType)
  const index = flow.indexOf(current)
  if (index === -1) return flow[0] ?? null
  return flow[index + 1] ?? null
}
