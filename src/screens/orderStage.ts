/**
 * How order stages and types are presented, in one place so a stage never
 * reads as "in_progress" on one screen and "In progress" on another.
 */
import type { AnyTone } from '../ui/tones'
import type { CustomerType, FabricSource, OrderStage, OrderType, PaymentMethod } from '../db/schema'
import { IconClock, IconRepeat, IconRuler, IconScissors, IconTag } from '../components/icons'

export const STAGE_LABELS: Record<OrderStage, string> = {
  measured: 'Measured',
  in_progress: 'In progress',
  ready: 'Ready',
  picked_up: 'Picked up',
  returned: 'Returned',
  cancelled: 'Cancelled',
  assessing: 'Assessing',
  approved: 'Approved',
  repairing: 'Repairing',
}

/** Legacy tone spellings; `ui/tones.ts` maps them. Rename in the final sweep. */
export const STAGE_TONES: Record<OrderStage, AnyTone> = {
  measured: 'neutral',
  in_progress: 'info',
  ready: 'good',
  picked_up: 'neutral',
  returned: 'neutral',
  // The one stage that is an adverse outcome rather than progress or a plain
  // finish, so it gets the tone none of the others use.
  cancelled: 'bad',
  assessing: 'neutral',
  approved: 'info',
  repairing: 'info',
}

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  tailor_made: 'Tailor-made',
  rental: 'Rental',
  purchase: 'Purchase',
  pre_order: 'Pre-order',
  repair: 'Repair',
}

/** Beside the labels so a new order type cannot get one and not the other. */
export const ORDER_TYPE_ICONS: Record<OrderType, (props: { size?: number }) => preact.JSX.Element> = {
  tailor_made: IconRuler,
  rental: IconRepeat,
  purchase: IconTag,
  pre_order: IconClock,
  repair: IconScissors,
}

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  individual: 'Individual',
  corporate: 'Corporate',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile money',
  bank: 'Bank',
  other: 'Other',
}

export const FABRIC_SOURCE_LABELS: Record<FabricSource, string> = {
  client: "Client's own fabric",
  shop: "Shop's fabric",
}

/**
 * The stages an order of each type actually passes through.
 *
 * A tailor-made garment is never "returned" -- the client keeps it. A rental
 * is. Showing every stage for every type would put a button on screen that
 * makes no sense for the order in front of you, which is how bad data gets
 * entered.
 *
 * 'cancelled' is deliberately absent from every flow: it is a terminal exit
 * reachable from any stage, not a rung between 'ready' and 'picked_up'.
 */
const FLOWS: Record<OrderType, readonly OrderStage[]> = {
  tailor_made: ['measured', 'in_progress', 'ready', 'picked_up'],
  purchase: ['measured', 'ready', 'picked_up'],
  rental: ['measured', 'ready', 'picked_up', 'returned'],
  // Same shape as purchase -- a pre-order is a purchase of something not
  // made or in stock yet, so it needs no return leg either.
  pre_order: ['measured', 'ready', 'picked_up'],
  // 'measured' doubles as "received" and 'picked_up' as "collected" -- the
  // same reuse every other type already makes of these two labels, not a
  // repair-specific meaning. 'assessing'/'approved'/'repairing' are the
  // three states section 33 asks for that nothing existing covers.
  repair: ['measured', 'assessing', 'approved', 'repairing', 'ready', 'picked_up'],
}

export function stagesFor(orderType: OrderType): readonly OrderStage[] {
  return FLOWS[orderType]
}

/**
 * The next stage in the flow, or null at the end.
 *
 * 'cancelled' is a terminal exit with no next stage, never a detour back to
 * the flow's first stage. For any other stage missing from the flow --
 * an order's type changed after the fact -- falling back to the first stage
 * is better than leaving the shop with no way forward.
 */
export function nextStage(orderType: OrderType, current: OrderStage): OrderStage | null {
  if (current === 'cancelled') return null
  const flow = stagesFor(orderType)
  const index = flow.indexOf(current)
  if (index === -1) return flow[0] ?? null
  return flow[index + 1] ?? null
}
