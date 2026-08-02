import { describe, expect, it } from 'vitest'
import { ORDER_STAGES, ORDER_TYPES } from '../db/schema'
import { ORDER_TYPE_LABELS, STAGE_LABELS, nextStage, stagesFor } from './orderStage'

describe('stage flows', () => {
  it('never puts "returned" in a tailor-made or purchase flow', () => {
    // The client keeps a garment they commissioned or bought. Offering a
    // "mark returned" button on those orders invites bad data.
    expect(stagesFor('tailor_made')).not.toContain('returned')
    expect(stagesFor('purchase')).not.toContain('returned')
    expect(stagesFor('rental')).toContain('returned')
  })

  it('starts every flow at the stage a new order is created in', () => {
    for (const type of ORDER_TYPES) {
      expect(stagesFor(type)[0]).toBe('measured')
    }
  })

  it('only uses stages the schema allows', () => {
    for (const type of ORDER_TYPES) {
      for (const stage of stagesFor(type)) {
        expect(ORDER_STAGES).toContain(stage)
      }
    }
  })
})

describe('nextStage', () => {
  it('walks a tailor-made order to the end and then stops', () => {
    expect(nextStage('tailor_made', 'measured')).toBe('in_progress')
    expect(nextStage('tailor_made', 'in_progress')).toBe('ready')
    expect(nextStage('tailor_made', 'ready')).toBe('picked_up')
    expect(nextStage('tailor_made', 'picked_up')).toBeNull()
  })

  it('walks a rental through to returned', () => {
    expect(nextStage('rental', 'ready')).toBe('picked_up')
    expect(nextStage('rental', 'picked_up')).toBe('returned')
    expect(nextStage('rental', 'returned')).toBeNull()
  })

  it('recovers when the order type changed under a stage not in the new flow', () => {
    // A rental switched to tailor_made while sitting at "returned" would
    // otherwise have no way forward at all.
    expect(nextStage('tailor_made', 'returned')).toBe('measured')
  })

  it('offers no next stage from cancelled, for any order type', () => {
    // Unlike the "type changed" recovery above, cancelled is a deliberate
    // terminal exit -- it must never fall back to the flow's first stage.
    for (const type of ORDER_TYPES) expect(nextStage(type, 'cancelled')).toBeNull()
  })
})

describe('labels', () => {
  it('covers every stage and type the schema allows', () => {
    // A missing entry renders as undefined rather than failing, so this is
    // worth asserting rather than trusting.
    for (const stage of ORDER_STAGES) expect(STAGE_LABELS[stage]).toBeTruthy()
    for (const type of ORDER_TYPES) expect(ORDER_TYPE_LABELS[type]).toBeTruthy()
  })
})
