/* What each order type needs from the form. Kept out of the form so a new order
   type has one obvious place to declare itself. */
import type { OrderType } from '../db/schema'

/** Something is being made or altered to fit, so the numbers matter. */
export function needsMeasurements(type: OrderType): boolean {
  return type === 'tailor_made' || type === 'repair'
}

/** Goes out and comes back, so it has a return date and a held deposit. */
export function needsReturn(type: OrderType): boolean {
  return type === 'rental'
}

/** Promised before it exists, so it carries an expected date. */
export function needsFulfilmentDate(type: OrderType): boolean {
  return type === 'pre_order'
}

/** What the date field should be called for this type. */
export function dueDateLabel(type: OrderType): string {
  if (type === 'rental') return 'Collection date'
  if (type === 'purchase') return 'Handover date'
  return 'Ready on'
}

/* The same date named where there is no room for the phrase above. Purchase says
   "Pickup" here and "Handover date" there; that predates this and is unreconciled. */
export function dueDateShortLabel(type: OrderType): string {
  return type === 'rental' ? 'Collection' : 'Pickup'
}

/* The type this shop takes most often, for the form to open on. A tie goes to
   the most recent, so a shop that changes what it does drifts. Newest first. */
export function usualOrderType(
  recentTypesNewestFirst: readonly OrderType[],
  fallback: OrderType = 'tailor_made',
): OrderType {
  if (recentTypesNewestFirst.length === 0) return fallback

  const counts = new Map<OrderType, number>()
  for (const type of recentTypesNewestFirst) {
    counts.set(type, (counts.get(type) ?? 0) + 1)
  }

  let best = recentTypesNewestFirst[0] as OrderType
  for (const type of recentTypesNewestFirst) {
    const count = counts.get(type) ?? 0
    if (count > (counts.get(best) ?? 0)) best = type
  }
  return best
}
