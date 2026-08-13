import { describe, expect, it } from 'vitest'
import {
  adjustmentTypeOf,
  blankHeader,
  blankUnit,
  draftFromOrder,
  isInvalid,
  planUnitWrites,
  unitsSubtotalMinor,
  validateOrderForm,
  type HeaderDraft,
  type UnitDraft,
  type ValidatedUnit,
} from './orderFormModel'
import type { OrderDoc, OrderUnitDoc } from '../db/schema'

const CURRENCY = 'UGX'

function header(patch: Partial<HeaderDraft> = {}): HeaderDraft {
  return { ...blankHeader('2026-08-01'), client_id: 'client-1', ...patch }
}

function unit(patch: Partial<UnitDraft> = {}): UnitDraft {
  return { ...blankUnit(), item_description: 'Kanzu', price: '50000', ...patch }
}

function validate(h: HeaderDraft, units: UnitDraft[]) {
  return validateOrderForm({ header: h, units, currency: CURRENCY })
}

describe('blankHeader', () => {
  it('opens a week out, which is the common case', () => {
    expect(blankHeader('2026-08-01').pickup_due_date).toBe('2026-08-08')
  })
})

describe('validateOrderForm', () => {
  it('accepts a minimal order', () => {
    const result = validate(header(), [unit()])
    expect(isInvalid(result)).toBe(false)
    if (isInvalid(result)) return
    expect(result.header.client_id).toBe('client-1')
    expect(result.units).toHaveLength(1)
    expect(result.units[0]?.price_minor).toBe(50000)
    expect(result.adjustmentMinor).toBe(0)
  })

  it('needs a client', () => {
    const result = validate(header({ client_id: '' }), [unit()])
    expect(result).toMatchObject({ scope: 'header', field: 'client_id' })
  })

  it('needs a pickup date', () => {
    const result = validate(header({ pickup_due_date: '' }), [unit()])
    expect(result).toMatchObject({ scope: 'header', field: 'pickup_due_date' })
  })

  it('refuses a return date before the pickup date', () => {
    const result = validate(
      header({ pickup_due_date: '2026-08-10', return_due_date: '2026-08-09' }),
      [unit()],
    )
    expect(result).toMatchObject({ scope: 'header', field: 'return_due_date' })
  })

  it('allows a return date on the pickup date', () => {
    const result = validate(
      header({ pickup_due_date: '2026-08-10', return_due_date: '2026-08-10' }),
      [unit()],
    )
    expect(isInvalid(result)).toBe(false)
  })

  it('makes a corporate order name its company', () => {
    const result = validate(header({ customer_type: 'corporate' }), [unit()])
    expect(result).toMatchObject({ scope: 'header', field: 'organisation_name' })
  })

  it('drops corporate-only fields for an individual', () => {
    const result = validate(
      header({ organisation_name: 'Acme', purchase_order_reference: 'PO-1', contact_person: 'Ada' }),
      [unit()],
    )
    if (isInvalid(result)) throw new Error('expected valid')
    expect(result.header.organisation_name).toBeUndefined()
    expect(result.header.purchase_order_reference).toBeUndefined()
  })

  it('reports which unit is wrong, not just that one is', () => {
    const bad = unit({ item_description: '  ' })
    const result = validate(header(), [unit(), bad])
    expect(result).toMatchObject({ scope: 'unit', key: bad.key, field: 'item_description' })
  })

  it('refuses a price that is not a number', () => {
    const only = unit({ price: 'about 50k' })
    const result = validate(header(), [only])
    expect(result).toMatchObject({ scope: 'unit', key: only.key, field: 'price' })
  })

  it('signs a discount negative and a charge positive', () => {
    const discount = validate(
      header({ adjustment_type: 'discount', adjustment_amount: '5000' }),
      [unit()],
    )
    const charge = validate(
      header({ adjustment_type: 'charge', adjustment_amount: '5000' }),
      [unit()],
    )
    if (isInvalid(discount) || isInvalid(charge)) throw new Error('expected valid')
    expect(discount.adjustmentMinor).toBe(-5000)
    expect(charge.adjustmentMinor).toBe(5000)
  })

  it('refuses a zero adjustment, which is what "none" is for', () => {
    const result = validate(header({ adjustment_type: 'discount', adjustment_amount: '0' }), [unit()])
    expect(result).toMatchObject({ scope: 'header', field: 'adjustment_amount' })
  })

  // The rule the review called out: it lived only in the screen and in
  // setOrderAdjustment, with no test able to see either.
  it('refuses a discount larger than the subtotal', () => {
    const result = validate(
      header({ adjustment_type: 'discount', adjustment_amount: '60000' }),
      [unit({ price: '50000' })],
    )
    expect(result).toMatchObject({ scope: 'header', field: 'adjustment_amount' })
  })

  it('allows a discount that takes the total to exactly zero', () => {
    const result = validate(
      header({ adjustment_type: 'discount', adjustment_amount: '50000' }),
      [unit({ price: '50000' })],
    )
    expect(isInvalid(result)).toBe(false)
  })

  it('sums every unit before checking the discount', () => {
    const result = validate(
      header({ adjustment_type: 'discount', adjustment_amount: '60000' }),
      [unit({ price: '50000' }), unit({ price: '30000' })],
    )
    expect(isInvalid(result)).toBe(false)
  })

  it('carries a deposit only for a rental', () => {
    const rental = validate(
      header({ order_type: 'rental', deposit_amount: '20000' }),
      [unit()],
    )
    const tailored = validate(header({ deposit_amount: '20000' }), [unit()])
    if (isInvalid(rental) || isInvalid(tailored)) throw new Error('expected valid')
    expect(rental.header.deposit_minor).toBe(20000)
    expect(tailored.header.deposit_minor).toBeUndefined()
  })

  it('refuses a deposit that is not a number', () => {
    const result = validate(header({ order_type: 'rental', deposit_amount: 'lots' }), [unit()])
    expect(result).toMatchObject({ scope: 'header', field: 'deposit_amount' })
  })

  it('omits a wearer name that is only whitespace', () => {
    const result = validate(header(), [unit({ wearer_name: '   ' })])
    if (isInvalid(result)) throw new Error('expected valid')
    expect(result.units[0]?.wearer_name).toBeUndefined()
  })

  it('keeps an adjustment reason only when one was typed', () => {
    const withReason = validate(
      header({ adjustment_type: 'charge', adjustment_amount: '1000', adjustment_reason: 'Rush' }),
      [unit()],
    )
    const without = validate(
      header({ adjustment_type: 'charge', adjustment_amount: '1000', adjustment_reason: '  ' }),
      [unit()],
    )
    if (isInvalid(withReason) || isInvalid(without)) throw new Error('expected valid')
    expect(withReason.adjustmentReason).toBe('Rush')
    expect(without.adjustmentReason).toBeUndefined()
  })
})

describe('adjustmentTypeOf', () => {
  it('reads the sign back', () => {
    expect(adjustmentTypeOf(0)).toBe('none')
    expect(adjustmentTypeOf(-1)).toBe('discount')
    expect(adjustmentTypeOf(1)).toBe('charge')
  })
})

describe('draftFromOrder', () => {
  const order = {
    id: 'order-1',
    client_id: 'client-9',
    order_type: 'rental',
    pickup_due_date: '2026-09-01',
    return_due_date: '2026-09-05',
    notes: 'Handle with care',
    currency: CURRENCY,
    price_total_minor: 45000,
    price_adjustment_minor: -5000,
    adjustment_reason: 'Regular',
    rental_deposit_minor: 20000,
    customer_type: 'corporate',
    organisation_name: 'Acme',
  } as unknown as OrderDoc

  const units = [
    {
      id: 'unit-1',
      item_description: 'Suit',
      price_minor: 50000,
      fabric_source: 'client',
      wearer_name: 'Ada',
      measurements: { chest: 40 },
    },
  ] as unknown as OrderUnitDoc[]

  it('round-trips through validate unchanged', () => {
    const draft = draftFromOrder(order, units)
    const result = validateOrderForm({ ...draft, currency: CURRENCY })
    if (isInvalid(result)) throw new Error('expected valid')

    expect(result.header.client_id).toBe('client-9')
    expect(result.header.return_due_date).toBe('2026-09-05')
    expect(result.header.deposit_minor).toBe(20000)
    expect(result.header.organisation_name).toBe('Acme')
    expect(result.adjustmentMinor).toBe(-5000)
    expect(result.adjustmentReason).toBe('Regular')
    expect(result.units[0]?.price_minor).toBe(50000)
    expect(result.units[0]?.wearer_name).toBe('Ada')
  })

  it('keys a persisted unit by its id, so it updates rather than duplicating', () => {
    const draft = draftFromOrder(order, units)
    expect(draft.units[0]?.key).toBe('unit-1')
    expect(draft.units[0]?.id).toBe('unit-1')
  })

  it('stringifies measurements for the inputs', () => {
    expect(draftFromOrder(order, units).units[0]?.measurements).toEqual({ chest: '40' })
  })

  it('leaves the deposit box empty when nothing is held', () => {
    const noDeposit = { ...order, rental_deposit_minor: 0 } as unknown as OrderDoc
    expect(draftFromOrder(noDeposit, units).header.deposit_amount).toBe('')
  })
})

describe('unitsSubtotalMinor', () => {
  it('adds what parses and ignores what does not', () => {
    expect(unitsSubtotalMinor([unit({ price: '1000' }), unit({ price: 'soon' })], CURRENCY)).toBe(1000)
  })
})

describe('planUnitWrites', () => {
  const persisted = (id: string): ValidatedUnit =>
    ({ key: id, id, item_description: 'x', price_minor: 1 }) as ValidatedUnit
  const fresh = (key: string): ValidatedUnit =>
    ({ key, item_description: 'x', price_minor: 1 }) as ValidatedUnit

  it('splits added, updated and removed', () => {
    const plan = planUnitWrites([persisted('a'), fresh('new')], ['a', 'b'])
    expect(plan.toAdd.map((u) => u.key)).toEqual(['new'])
    expect(plan.toUpdate.map((u) => u.id)).toEqual(['a'])
    expect(plan.toRemoveIds).toEqual(['b'])
  })

  it('removes nothing when every existing unit is kept', () => {
    expect(planUnitWrites([persisted('a'), persisted('b')], ['a', 'b']).toRemoveIds).toEqual([])
  })

  it('treats a create as all-adds', () => {
    const plan = planUnitWrites([fresh('one'), fresh('two')], [])
    expect(plan.toAdd).toHaveLength(2)
    expect(plan.toUpdate).toHaveLength(0)
    expect(plan.toRemoveIds).toEqual([])
  })

  // Replacing every unit at once still leaves the order non-empty at all times,
  // because the adds are applied before the removals.
  it('adds before it removes when the whole set is swapped', () => {
    const plan = planUnitWrites([fresh('new')], ['old'])
    expect(plan.toAdd).toHaveLength(1)
    expect(plan.toRemoveIds).toEqual(['old'])
  })
})
