/* Everything the order form decides, as pure functions. Kept out of the
   component so the rules are testable without a DOM -- see docs/CODE_REVIEW.md. */
import { addDays, today } from '../lib/dates'
import { newId } from '../lib/ids'
import { fromMinorUnits, parseToMinor } from '../lib/money'
import { needsFulfilmentDate, needsReturn } from '../lib/orderTypes'
import type { OrderHeaderInput, OrderUnitInput } from '../db/repo'
import type {
  CustomerType,
  FabricSource,
  OrderDoc,
  OrderStage,
  OrderType,
  OrderUnitDoc,
} from '../db/schema'

/** A same-day match must still be open -- a finished order is not a candidate. */
export const CLOSED_STAGES: readonly OrderStage[] = ['picked_up', 'returned', 'cancelled']

export type AdjustmentType = 'none' | 'discount' | 'charge'

export interface HeaderDraft {
  client_id: string
  order_type: OrderType
  pickup_due_date: string
  return_due_date: string
  notes: string
  adjustment_type: AdjustmentType
  adjustment_amount: string
  adjustment_reason: string
  customer_type: CustomerType
  organisation_name: string
  purchase_order_reference: string
  contact_person: string
  expected_fulfilment_date: string
  /** Rental only. */
  deposit_amount: string
}

/** One item. `key` is stable across renders; `id` exists once persisted. */
export interface UnitDraft {
  key: string
  id?: string
  wearer_name: string
  item_description: string
  price: string
  fabric_source: FabricSource
  measurements: Record<string, string>
}

export type HeaderFieldKey =
  | 'client_id'
  | 'pickup_due_date'
  | 'return_due_date'
  | 'adjustment_amount'
  | 'organisation_name'
  | 'deposit_amount'

export type UnitFieldKey = 'item_description' | 'price'

/* A rejection carries which field it is about, so the message shows beside that
   field rather than in one note at the foot of the form. */
export type Invalid =
  | { scope: 'header'; field: HeaderFieldKey; message: string }
  | { scope: 'unit'; key: string; field: UnitFieldKey; message: string }

export interface ValidatedUnit extends OrderUnitInput {
  key: string
  id?: string
}

export interface ValidatedForm {
  header: OrderHeaderInput
  units: ValidatedUnit[]
  adjustmentMinor: number
  adjustmentReason?: string
}

export function isInvalid(result: ValidatedForm | Invalid): result is Invalid {
  return 'scope' in result
}

export function blankUnit(): UnitDraft {
  return {
    key: newId(),
    wearer_name: '',
    item_description: '',
    price: '',
    fabric_source: 'shop',
    measurements: {},
  }
}

/* A week out is the common case, and saves a date-picker interaction on nearly
   every order. `from` is injectable so the default is testable. */
export function blankHeader(from: string = today()): HeaderDraft {
  return {
    client_id: '',
    order_type: 'tailor_made',
    pickup_due_date: addDays(from, 7),
    return_due_date: '',
    notes: '',
    adjustment_type: 'none',
    adjustment_amount: '',
    adjustment_reason: '',
    customer_type: 'individual',
    organisation_name: '',
    purchase_order_reference: '',
    contact_person: '',
    expected_fulfilment_date: '',
    deposit_amount: '',
  }
}

/** Which adjustment a stored signed minor amount represents. */
export function adjustmentTypeOf(adjustmentMinor: number): AdjustmentType {
  if (adjustmentMinor === 0) return 'none'
  return adjustmentMinor < 0 ? 'discount' : 'charge'
}

/* Turns a persisted order back into an editable draft. The inverse of
   `validateOrderForm`, so a load-then-save round trip changes nothing. */
export function draftFromOrder(
  order: OrderDoc,
  units: readonly OrderUnitDoc[],
): { header: HeaderDraft; units: UnitDraft[] } {
  return {
    header: {
      client_id: order.client_id,
      order_type: order.order_type,
      pickup_due_date: order.pickup_due_date,
      return_due_date: order.return_due_date ?? '',
      notes: order.notes ?? '',
      adjustment_type: adjustmentTypeOf(order.price_adjustment_minor),
      adjustment_amount:
        order.price_adjustment_minor === 0
          ? ''
          : String(fromMinorUnits(Math.abs(order.price_adjustment_minor), order.currency)),
      adjustment_reason: order.adjustment_reason ?? '',
      customer_type: order.customer_type ?? 'individual',
      organisation_name: order.organisation_name ?? '',
      purchase_order_reference: order.purchase_order_reference ?? '',
      contact_person: order.contact_person ?? '',
      expected_fulfilment_date: order.expected_fulfilment_date ?? '',
      deposit_amount:
        order.rental_deposit_minor > 0
          ? String(fromMinorUnits(order.rental_deposit_minor, order.currency))
          : '',
    },
    units: units.map((unit) => ({
      key: unit.id,
      id: unit.id,
      wearer_name: unit.wearer_name ?? '',
      item_description: unit.item_description,
      price: String(fromMinorUnits(unit.price_minor, order.currency)),
      fabric_source: unit.fabric_source,
      measurements: Object.fromEntries(
        Object.entries(unit.measurements).map(([key, value]) => [key, String(value)]),
      ),
    })),
  }
}

/** Shown while you type, because it is the figure the client asks for. */
export function unitsSubtotalMinor(units: readonly UnitDraft[], currency: string): number {
  return units.reduce((sum, unit) => sum + (parseToMinor(unit.price, currency) ?? 0), 0)
}

export function validateOrderForm({
  header,
  units,
  currency,
}: {
  header: HeaderDraft
  units: readonly UnitDraft[]
  currency: string
}): ValidatedForm | Invalid {
  if (!header.client_id) {
    return { scope: 'header', field: 'client_id', message: 'Choose which client this order is for.' }
  }
  if (!header.pickup_due_date) {
    return { scope: 'header', field: 'pickup_due_date', message: 'A pickup date is needed.' }
  }
  if (header.return_due_date && header.return_due_date < header.pickup_due_date) {
    return {
      scope: 'header',
      field: 'return_due_date',
      message: 'The return date cannot be before the pickup date.',
    }
  }
  if (header.customer_type === 'corporate' && !header.organisation_name.trim()) {
    return {
      scope: 'header',
      field: 'organisation_name',
      message: 'Name the company this order is for.',
    }
  }

  let depositMinor = 0
  if (needsReturn(header.order_type) && header.deposit_amount.trim()) {
    const parsed = parseToMinor(header.deposit_amount, currency)
    if (parsed === null || parsed < 0) {
      return { scope: 'header', field: 'deposit_amount', message: 'Enter the deposit as a number.' }
    }
    depositMinor = parsed
  }

  let adjustmentMinor = 0
  if (header.adjustment_type !== 'none') {
    const magnitude = parseToMinor(header.adjustment_amount, currency)
    if (magnitude === null || magnitude === 0) {
      return {
        scope: 'header',
        field: 'adjustment_amount',
        message: 'Enter the adjustment as a number greater than zero.',
      }
    }
    adjustmentMinor = header.adjustment_type === 'discount' ? -magnitude : magnitude
  }

  const validatedUnits: ValidatedUnit[] = []
  for (const unit of units) {
    if (!unit.item_description.trim()) {
      return { scope: 'unit', key: unit.key, field: 'item_description', message: 'Describe this item.' }
    }
    const price = parseToMinor(unit.price, currency)
    if (price === null) {
      return { scope: 'unit', key: unit.key, field: 'price', message: 'Enter the price as a number.' }
    }
    validatedUnits.push({
      key: unit.key,
      id: unit.id,
      item_description: unit.item_description,
      price_minor: price,
      fabric_source: unit.fabric_source,
      measurements: unit.measurements,
      ...(unit.wearer_name.trim() ? { wearer_name: unit.wearer_name } : {}),
    })
  }

  // Mirrors setOrderAdjustment's own check one level up, so a discount larger
  // than the subtotal never leaves an order half-written.
  const subtotal = validatedUnits.reduce((sum, unit) => sum + unit.price_minor, 0)
  if (subtotal + adjustmentMinor < 0) {
    return {
      scope: 'header',
      field: 'adjustment_amount',
      message: 'That discount is larger than the order total.',
    }
  }

  return {
    header: {
      client_id: header.client_id,
      order_type: header.order_type,
      pickup_due_date: header.pickup_due_date,
      ...(header.return_due_date ? { return_due_date: header.return_due_date } : {}),
      ...(header.notes.trim() ? { notes: header.notes } : {}),
      customer_type: header.customer_type,
      ...(header.customer_type === 'corporate'
        ? {
            organisation_name: header.organisation_name,
            ...(header.purchase_order_reference.trim()
              ? { purchase_order_reference: header.purchase_order_reference }
              : {}),
            ...(header.contact_person.trim() ? { contact_person: header.contact_person } : {}),
          }
        : {}),
      ...(needsFulfilmentDate(header.order_type) && header.expected_fulfilment_date
        ? { expected_fulfilment_date: header.expected_fulfilment_date }
        : {}),
      ...(needsReturn(header.order_type) ? { deposit_minor: depositMinor } : {}),
    },
    units: validatedUnits,
    adjustmentMinor,
    adjustmentReason: header.adjustment_reason.trim() || undefined,
  }
}

export interface UnitWritePlan {
  toAdd: ValidatedUnit[]
  toUpdate: ValidatedUnit[]
  toRemoveIds: string[]
}

/* The edit save, as a plan rather than a loop in a click handler. Adds are
   applied before removals: removeOrderUnit refuses to leave an order at zero. */
export function planUnitWrites(
  units: readonly ValidatedUnit[],
  existingIds: readonly string[],
): UnitWritePlan {
  const kept = new Set(units.map((unit) => unit.id).filter((id): id is string => Boolean(id)))
  return {
    toAdd: units.filter((unit) => !unit.id),
    toUpdate: units.filter((unit) => Boolean(unit.id)),
    toRemoveIds: existingIds.filter((id) => !kept.has(id)),
  }
}
