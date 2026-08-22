import { describe, expect, it } from 'vitest'
import type { OutboxEntry } from '../schema'
import {
  EPOCH,
  forWire,
  fromWire,
  nextCursor,
  pendingIds,
  shouldAccept,
  toPushItem,
} from './plan'
import { DELETE_ORDER, PUSH_ORDER } from './order'

function entry(over: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: 'clients:c1',
    store: 'clients',
    row_id: 'c1',
    operation: 'updated',
    fields: ['name'],
    updated_at: '2026-08-22T09:00:00.000Z',
    attempts: 0,
    ...over,
  }
}

const row = {
  id: 'c1',
  shop_id: 'shop-1',
  name: 'Grace',
  phone: '0700000123',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-22T09:00:00.000Z',
}

describe('toPushItem for a new row', () => {
  it('sends the whole row, because the server has nothing to merge into', () => {
    const item = toPushItem(entry({ operation: 'created', fields: [] }), row)
    expect(item?.payload).toEqual(row)
    expect(item?.operation).toBe('created')
  })

  it('sends the whole row even when fields were recorded', () => {
    const item = toPushItem(entry({ operation: 'created', fields: ['name'] }), row)
    expect(item?.payload).toEqual(row)
  })
})

describe('toPushItem for an edit', () => {
  /* The point of the whole design: a field this device did not touch is left as
     the other device left it. */
  it('sends only the changed fields, the id, and when it changed', () => {
    const item = toPushItem(entry({ fields: ['name'] }), row)
    expect(item?.payload).toEqual({
      id: 'c1',
      name: 'Grace',
      updated_at: '2026-08-22T09:00:00.000Z',
    })
    expect(item?.payload).not.toHaveProperty('phone')
    expect(item?.payload).not.toHaveProperty('shop_id')
  })

  it('always carries updated_at, even when the entry did not name it', () => {
    const item = toPushItem(entry({ fields: [] }), row)
    expect(item?.payload).toHaveProperty('updated_at')
  })

  /* An edit that cleared a field has to clear it on the server too. Leaving it
     out would let the other device's value stand. */
  it('sends null for a field the row no longer has', () => {
    const item = toPushItem(entry({ fields: ['notes'] }), row)
    expect(item?.payload.notes).toBeNull()
  })

  it('sends several changed fields together', () => {
    const item = toPushItem(entry({ fields: ['name', 'phone'] }), row)
    expect(item?.payload).toMatchObject({ name: 'Grace', phone: '0700000123' })
  })
})

describe('toPushItem for a delete', () => {
  it('sends deleted_at alongside whatever else changed', () => {
    const deleted = { ...row, deleted_at: '2026-08-22T10:00:00.000Z' }
    const item = toPushItem(entry({ operation: 'deleted', fields: ['deleted_at'] }), deleted)
    expect(item?.payload).toMatchObject({ id: 'c1', deleted_at: '2026-08-22T10:00:00.000Z' })
  })

  it('carries the void trail a payment records with its delete', () => {
    const voided = { ...row, deleted_at: 'x', voided_at: 'x', void_reason: 'entered twice' }
    const item = toPushItem(
      entry({ operation: 'deleted', fields: ['deleted_at', 'voided_at', 'void_reason'] }),
      voided,
    )
    expect(item?.payload.void_reason).toBe('entered twice')
  })
})

describe('toPushItem when the row is gone', () => {
  /* Re-creating a row from an outbox entry would invent state the shop never
     had. Nothing to send is the right answer. */
  it('sends nothing rather than inventing a row', () => {
    expect(toPushItem(entry(), undefined)).toBeNull()
    expect(toPushItem(entry({ operation: 'created' }), undefined)).toBeNull()
    expect(toPushItem(entry({ operation: 'deleted' }), undefined)).toBeNull()
  })
})

describe('forWire', () => {
  /* _modified is the server's word for when it saw a row. A device sending one
     would be claiming to know that. */
  it('never sends the server cursor column', () => {
    expect(forWire({ id: 'c1', _modified: '2026-08-22T00:00:00.000Z' })).toEqual({ id: 'c1' })
  })

  it('drops undefined, which JSON would send as absent anyway', () => {
    expect(forWire({ id: 'c1', notes: undefined })).toEqual({ id: 'c1' })
  })

  it('keeps an explicit null, which is how a field is cleared', () => {
    expect(forWire({ id: 'c1', notes: null })).toEqual({ id: 'c1', notes: null })
  })

  it('keeps a false and a zero', () => {
    expect(forWire({ active: false, count: 0 })).toEqual({ active: false, count: 0 })
  })
})

describe('fromWire', () => {
  /* Postgres sends null for an unset optional column where the row type wants
     it absent. That mismatch is what made the old replication unusable. */
  it('drops nulls, so an unset column reads as absent', () => {
    expect(fromWire({ id: 'c1', phone: null, name: 'Grace' })).toEqual({ id: 'c1', name: 'Grace' })
  })

  it('drops the server cursor column, which is not stored here', () => {
    expect(fromWire({ id: 'c1', _modified: 'x' })).toEqual({ id: 'c1' })
  })

  it('keeps a false and a zero rather than reading them as unset', () => {
    expect(fromWire({ active: false, quantity: 0 })).toEqual({ active: false, quantity: 0 })
  })

  it('keeps an empty string and an empty object', () => {
    expect(fromWire({ notes: '', measurements: {} })).toEqual({ notes: '', measurements: {} })
  })
})

describe('shouldAccept', () => {
  /* A row this device still owes has an edit nobody else has seen. Overwriting
     it would discard work that is on screen right now. */
  it('refuses a row this device has not pushed yet', () => {
    expect(shouldAccept('c1', new Set(['c1']))).toBe(false)
  })

  it('accepts a row with nothing pending', () => {
    expect(shouldAccept('c1', new Set(['c2']))).toBe(true)
    expect(shouldAccept('c1', new Set())).toBe(true)
  })
})

describe('nextCursor', () => {
  it('advances to the newest row in the batch', () => {
    const rows = [{ _modified: '2026-08-01T00:00:00Z' }, { _modified: '2026-08-03T00:00:00Z' }]
    expect(nextCursor(rows, EPOCH)).toBe('2026-08-03T00:00:00Z')
  })

  it('stays where it was on an empty batch', () => {
    expect(nextCursor([], '2026-08-01T00:00:00Z')).toBe('2026-08-01T00:00:00Z')
  })

  /* Never goes backwards. A row arriving with an older stamp than the cursor
     would otherwise re-deliver everything after it on the next pull. */
  it('never moves backwards', () => {
    const rows = [{ _modified: '2026-07-01T00:00:00Z' }]
    expect(nextCursor(rows, '2026-08-01T00:00:00Z')).toBe('2026-08-01T00:00:00Z')
  })

  it('ignores a row with no cursor value', () => {
    expect(nextCursor([{ id: 'x' }, { _modified: 7 }], EPOCH)).toBe(EPOCH)
  })
})

describe('pendingIds', () => {
  it('picks out one store', () => {
    const entries = [
      entry({ store: 'clients', row_id: 'c1' }),
      entry({ store: 'orders', row_id: 'o1' }),
    ]
    expect([...pendingIds(entries, 'clients')]).toEqual(['c1'])
  })

  it('is empty for a store with nothing pending', () => {
    expect(pendingIds([entry()], 'sales').size).toBe(0)
  })
})

describe('PUSH_ORDER', () => {
  it('names every synced store exactly once', () => {
    expect(new Set(PUSH_ORDER).size).toBe(PUSH_ORDER.length)
  })

  /* Spot checks on the references that make the declaration order wrong: these
     are the ones a plain alphabetical or store-order push would break. */
  it('writes a parent before the row that points at it', () => {
    const at = (store: string) => PUSH_ORDER.indexOf(store as never)
    expect(at('shops')).toBe(0)
    expect(at('product_categories')).toBeLessThan(at('products'))
    expect(at('collections')).toBeLessThan(at('products'))
    expect(at('products')).toBeLessThan(at('product_variants'))
    expect(at('suppliers')).toBeLessThan(at('materials'))
    expect(at('products')).toBeLessThan(at('production_batches'))
    expect(at('product_variants')).toBeLessThan(at('inventory_items'))
    expect(at('materials')).toBeLessThan(at('inventory_items'))
    expect(at('inventory_items')).toBeLessThan(at('inventory_movements'))
    expect(at('production_batches')).toBeLessThan(at('production_batch_costs'))
    expect(at('clients')).toBeLessThan(at('orders'))
    expect(at('garment_units')).toBeLessThan(at('orders'))
    expect(at('orders')).toBeLessThan(at('order_units'))
    expect(at('orders')).toBeLessThan(at('payments'))
    expect(at('staff')).toBeLessThan(at('events'))
  })

  it('deletes children before parents', () => {
    expect(DELETE_ORDER[0]).toBe('payments')
    expect(DELETE_ORDER[DELETE_ORDER.length - 1]).toBe('shops')
  })
})
