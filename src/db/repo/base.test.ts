import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type PolysterDatabase } from '../dexie/database'
import type { ClientDoc } from '../schema'
import {
  alive,
  changedFields,
  buildEvent,
  getActor,
  gone,
  insertRow,
  loadOrThrow,
  missing,
  nothingToRecord,
  patchRow,
  present,
  prune,
  restoreRow,
  setActor,
  softDeleteRow,
} from './base'

const opened: PolysterDatabase[] = []
let counter = 0

function fresh(): PolysterDatabase {
  const db = createDatabase(`repo_base_${++counter}`)
  opened.push(db)
  return db
}

function client(id: string, name = 'Amina'): ClientDoc {
  return {
    id,
    shop_id: 'shop-1',
    name,
    created_at: '2026-08-01T09:00:00.000Z',
    updated_at: '2026-08-01T09:00:00.000Z',
  }
}

beforeEach(() => setActor(null))

afterEach(async () => {
  setActor(null)
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
})

describe('alive, gone and present', () => {
  it('drops soft-deleted rows', () => {
    const rows = [client('a'), { ...client('b'), deleted_at: '2026-08-02T00:00:00.000Z' }]
    expect(alive(rows).map((row) => row.id)).toEqual(['a'])
  })

  it('treats a missing row and a deleted row alike', () => {
    expect(gone(undefined)).toBe(true)
    expect(gone({ ...client('a'), deleted_at: 'x' })).toBe(true)
    expect(gone(client('a'))).toBe(false)
  })

  it('returns null rather than a deleted row', () => {
    expect(present(undefined)).toBeNull()
    expect(present({ ...client('a'), deleted_at: 'x' })).toBeNull()
    expect(present(client('a'))?.id).toBe('a')
  })
})

describe('prune', () => {
  it('drops keys set to undefined', () => {
    expect(prune({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null })
  })

  it('keeps a false and a zero', () => {
    expect(prune({ a: false, b: 0, c: '' })).toEqual({ a: false, b: 0, c: '' })
  })
})

describe('buildEvent', () => {
  it('credits the active staff member', () => {
    setActor('staff-7')
    expect(buildEvent({ shop_id: 's', entity: 'clients', entity_id: 'c', action: 'created' }))
      .toMatchObject({ actor_staff_id: 'staff-7', action: 'created' })
  })

  it('leaves the actor off when nobody has unlocked the device', () => {
    expect(buildEvent({ shop_id: 's', entity: 'clients', entity_id: 'c', action: 'created' }))
      .not.toHaveProperty('actor_staff_id')
  })

  it('gives every event its own id', () => {
    const one = buildEvent({ shop_id: 's', entity: 'clients', entity_id: 'c', action: 'created' })
    const two = buildEvent({ shop_id: 's', entity: 'clients', entity_id: 'c', action: 'created' })
    expect(one.id).not.toBe(two.id)
  })
})

describe('setActor', () => {
  it('reads back what was set', () => {
    setActor('staff-1')
    expect(getActor()).toBe('staff-1')
    setActor(null)
    expect(getActor()).toBeNull()
  })
})

describe('insertRow', () => {
  it('stores the row', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    expect((await db.clients.get('c1'))?.name).toBe('Amina')
  })

  it('records a created event naming the table', async () => {
    const db = fresh()
    setActor('staff-3')
    await insertRow(db.clients, client('c1'), 'shop-1', 'Added Amina')

    const events = await db.events.toArray()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      shop_id: 'shop-1',
      entity: 'clients',
      entity_id: 'c1',
      action: 'created',
      actor_staff_id: 'staff-3',
      summary: 'Added Amina',
    })
    // No row copy: the row is in its own store, and soft delete keeps it there.
    expect(events[0]?.after).toBeUndefined()
  })

  it('writes no event when the insert fails', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await expect(insertRow(db.clients, client('c1'), 'shop-1')).rejects.toThrow()
    expect(await db.events.count()).toBe(1)
  })
})

describe('patchRow', () => {
  it('applies the change', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    const next = await patchRow(db.clients, 'c1', { name: 'Grace' })
    expect(next.name).toBe('Grace')
    expect((await db.clients.get('c1'))?.name).toBe('Grace')
  })

  it('clears a field set to undefined', async () => {
    const db = fresh()
    await insertRow(db.clients, { ...client('c1'), phone: '0700000123' }, 'shop-1')
    await patchRow(db.clients, 'c1', { phone: undefined })
    expect(await db.clients.get('c1')).not.toHaveProperty('phone')
  })

  it('records both sides of the change, and only what changed', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await patchRow(db.clients, 'c1', { name: 'Grace' })

    const event = (await db.events.toArray()).find((row) => row.action === 'updated')
    expect(event?.before).toEqual({ name: 'Amina' })
    expect(event?.after).toEqual({ name: 'Grace' })
  })

  /* The whole point of the diff: an event about one field must not carry a copy
     of every other field on the row. */
  it('leaves untouched fields out of the event', async () => {
    const db = fresh()
    await insertRow(db.clients, { ...client('c1'), phone: '0700000123' }, 'shop-1')
    await patchRow(db.clients, 'c1', { name: 'Grace' })

    const event = (await db.events.toArray()).find((row) => row.action === 'updated')
    expect(Object.keys(event?.after ?? {})).toEqual(['name'])
    expect(event?.after).not.toHaveProperty('phone')
    expect(event?.after).not.toHaveProperty('shop_id')
  })

  it('writes no event at all when nothing actually changed', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await patchRow(db.clients, 'c1', { name: 'Amina' })

    expect((await db.events.toArray()).some((row) => row.action === 'updated')).toBe(false)
  })

  /* A recalculate that finds the same total writes updated_at and nothing else.
     Logging that says a row was touched without saying anything happened. */
  it('writes no event when only updated_at moved', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await patchRow(db.clients, 'c1', { updated_at: '2026-09-09T00:00:00.000Z' })

    expect((await db.events.toArray()).some((row) => row.action === 'updated')).toBe(false)
    expect((await db.clients.get('c1'))?.updated_at).toBe('2026-09-09T00:00:00.000Z')
  })

  // A caller that passed a summary meant to say something, even about a no-op.
  it('still records a no-op that was given a summary', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await patchRow(db.clients, 'c1', { name: 'Amina' }, { summary: 'reviewed' })

    const event = (await db.events.toArray()).find((row) => row.action === 'updated')
    expect(event?.summary).toBe('reviewed')
  })

  it('takes the shop id off the row', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await patchRow(db.clients, 'c1', { name: 'Grace' })
    const event = (await db.events.toArray()).find((row) => row.action === 'updated')
    expect(event?.shop_id).toBe('shop-1')
  })

  it('refuses a row that is not here', async () => {
    const db = fresh()
    await expect(patchRow(db.clients, 'nope', { name: 'x' }, { label: 'client' })).rejects.toThrow(
      'That client no longer exists on this device.',
    )
    expect(await db.events.count()).toBe(0)
  })

  it('refuses a soft-deleted row', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await softDeleteRow(db.clients, 'c1')
    await expect(patchRow(db.clients, 'c1', { name: 'x' })).rejects.toThrow()
  })
})

describe('softDeleteRow', () => {
  it('keeps the row and stamps it', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await softDeleteRow(db.clients, 'c1')

    const row = await db.clients.get('c1')
    expect(row).toBeDefined()
    expect(row?.deleted_at).toBeTypeOf('string')
  })

  it('records a deleted event holding what was there', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await softDeleteRow(db.clients, 'c1', { summary: 'Archived Amina' })

    const event = (await db.events.toArray()).find((row) => row.action === 'deleted')
    expect(event).toMatchObject({ entity: 'clients', shop_id: 'shop-1', summary: 'Archived Amina' })
    // The row is still on disk, stamped, so the event carries no copy of it.
    expect(event?.before).toBeUndefined()
  })

  it('does nothing twice', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await softDeleteRow(db.clients, 'c1')
    const stamp = (await db.clients.get('c1'))?.deleted_at
    await softDeleteRow(db.clients, 'c1')

    expect((await db.clients.get('c1'))?.deleted_at).toBe(stamp)
    expect((await db.events.toArray()).filter((row) => row.action === 'deleted')).toHaveLength(1)
  })

  it('ignores a row that was never here', async () => {
    const db = fresh()
    await softDeleteRow(db.clients, 'nope')
    expect(await db.events.count()).toBe(0)
  })
})

describe('restoreRow', () => {
  it('takes the stamp back off', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await softDeleteRow(db.clients, 'c1')
    await restoreRow(db.clients, 'c1')

    expect(await db.clients.get('c1')).not.toHaveProperty('deleted_at')
    expect((await db.events.toArray()).some((row) => row.action === 'restored')).toBe(true)
  })

  it('leaves a live row alone', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await restoreRow(db.clients, 'c1')
    expect((await db.events.toArray()).some((row) => row.action === 'restored')).toBe(false)
  })
})

describe('loadOrThrow', () => {
  it('returns the row', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    expect((await loadOrThrow(db.clients, 'c1', 'client')).name).toBe('Amina')
  })

  it('throws the shared wording', async () => {
    const db = fresh()
    await expect(loadOrThrow(db.clients, 'c1', 'order')).rejects.toThrow(
      'That order no longer exists on this device.',
    )
  })

  it('treats a soft-deleted row as absent', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await softDeleteRow(db.clients, 'c1')
    await expect(loadOrThrow(db.clients, 'c1', 'client')).rejects.toThrow()
  })
})

describe('missing', () => {
  it('reads as one sentence naming the thing', () => {
    expect(missing('payment').message).toBe('That payment no longer exists on this device.')
  })
})

import type { Observable } from 'dexie'
import { getRow, listAll, listBy, observeAll, observeBy, observeRow, sortRows } from './base'

function first<T>(source: Observable<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const sub = source.subscribe({
      next: (value) => {
        sub.unsubscribe()
        resolve(value)
      },
      error: reject,
    })
  })
}

/* Subscribes, waits for the first emission, runs `action`, then resolves with
   both emissions. Writing before the first emission registers no observation. */
async function nextAfter<T>(source: Observable<T>, action: () => Promise<void>): Promise<[T, T]> {
  const seen: T[] = []
  let settle: (pair: [T, T]) => void = () => {}
  const both = new Promise<[T, T]>((resolve) => (settle = resolve))

  const sub = source.subscribe({
    next: (value) => {
      seen.push(value)
      if (seen.length === 2) {
        sub.unsubscribe()
        settle([seen[0] as T, seen[1] as T])
      }
    },
  })

  while (seen.length === 0) await new Promise((resolve) => setTimeout(resolve, 5))
  await action()
  return both
}

describe('sortRows', () => {
  it('leaves the list alone with no sort', () => {
    const rows = [client('b'), client('a')]
    expect(sortRows(rows).map((row) => row.id)).toEqual(['b', 'a'])
  })

  it('sorts strings both ways', () => {
    const rows = [client('b', 'Zainab'), client('a', 'Amina')]
    expect(sortRows(rows, { key: 'name' }).map((row) => row.id)).toEqual(['a', 'b'])
    expect(sortRows(rows, { key: 'name', dir: 'desc' }).map((row) => row.id)).toEqual(['b', 'a'])
  })

  it('sorts numbers by value, not by their text', () => {
    const rows = [
      { id: 'a', position: 10 },
      { id: 'b', position: 9 },
    ]
    expect(sortRows(rows, { key: 'position' }).map((row) => row.id)).toEqual(['b', 'a'])
  })

  it('puts a row missing the field last either way', () => {
    const rows = [client('a'), { ...client('b'), phone: '0700' }]
    expect(sortRows(rows, { key: 'phone' }).map((row) => row.id)).toEqual(['b', 'a'])
    expect(sortRows(rows, { key: 'phone', dir: 'desc' }).map((row) => row.id)).toEqual(['b', 'a'])
  })

  it('does not disturb the list it was given', () => {
    const rows = [client('b', 'Z'), client('a', 'A')]
    sortRows(rows, { key: 'name' })
    expect(rows.map((row) => row.id)).toEqual(['b', 'a'])
  })
})

describe('observeAll', () => {
  it('emits the rows now on disk', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1', 'Zainab'), 'shop-1')
    await insertRow(db.clients, client('c2', 'Amina'), 'shop-1')

    const seen = await first(observeAll(db.clients, { key: 'name' }))
    expect(seen.map((row) => row.name)).toEqual(['Amina', 'Zainab'])
  })

  it('hides a soft-deleted row', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await softDeleteRow(db.clients, 'c1')
    expect(await first(observeAll(db.clients))).toEqual([])
  })

  it('emits again when a row is written', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    const [before, after] = await nextAfter(observeAll(db.clients), async () => {
      await insertRow(db.clients, client('c2'), 'shop-1')
    })
    expect(before).toHaveLength(1)
    expect(after).toHaveLength(2)
  })

  it('emits again when a row is soft-deleted', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    const [, after] = await nextAfter(observeAll(db.clients), async () => {
      await softDeleteRow(db.clients, 'c1')
    })
    expect(after).toEqual([])
  })
})

describe('observeBy', () => {
  it('returns only the matching rows', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await insertRow(db.clients, { ...client('c2'), shop_id: 'shop-2' }, 'shop-2')

    const seen = await first(observeBy(db.clients, 'shop_id', 'shop-1'))
    expect(seen.map((row) => row.id)).toEqual(['c1'])
  })

  it('drops soft-deleted matches', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await insertRow(db.clients, client('c2'), 'shop-1')
    await softDeleteRow(db.clients, 'c1')

    const seen = await first(observeBy(db.clients, 'shop_id', 'shop-1'))
    expect(seen.map((row) => row.id)).toEqual(['c2'])
  })
})

describe('observeRow', () => {
  it('emits the row then null once it is deleted', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    const [before, after] = await nextAfter(observeRow(db.clients, 'c1'), async () => {
      await softDeleteRow(db.clients, 'c1')
    })
    expect(before?.id).toBe('c1')
    expect(after).toBeNull()
  })

  it('emits null for an id that was never here', async () => {
    const db = fresh()
    expect(await first(observeRow(db.clients, 'nope'))).toBeNull()
  })
})

describe('the one-shot reads', () => {
  it('listBy and listAll drop deleted rows', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await insertRow(db.clients, client('c2'), 'shop-1')
    await softDeleteRow(db.clients, 'c2')

    expect(await listAll(db.clients)).toHaveLength(1)
    expect(await listBy(db.clients, 'shop_id', 'shop-1')).toHaveLength(1)
  })

  it('getRow returns null for a deleted row', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await softDeleteRow(db.clients, 'c1')
    expect(await getRow(db.clients, 'c1')).toBeNull()
  })
})

describe('changedFields', () => {
  it('returns only the keys that differ', () => {
    const diff = changedFields({ a: 1, b: 2, c: 3 }, { a: 1, b: 9, c: 3 })
    expect(diff).toEqual({ before: { b: 2 }, after: { b: 9 } })
  })

  it('reports a key that appeared', () => {
    expect(changedFields({ a: 1 }, { a: 1, b: 2 })).toEqual({ before: {}, after: { b: 2 } })
  })

  it('reports a key that went away', () => {
    expect(changedFields({ a: 1, b: 2 }, { a: 1 })).toEqual({ before: { b: 2 }, after: {} })
  })

  it('is empty when nothing changed', () => {
    expect(changedFields({ a: 1 }, { a: 1 })).toEqual({ before: {}, after: {} })
  })

  /* measurements and permission_overrides are object columns. Comparing them by
     reference would log a change on every save that merely re-set them. */
  it('compares object values, not references', () => {
    const before = { measurements: { chest: 40 } }
    const after = { measurements: { chest: 40 } }
    expect(changedFields(before, after)).toEqual({ before: {}, after: {} })
  })

  it('sees a real change inside an object value', () => {
    const diff = changedFields({ m: { chest: 40 } }, { m: { chest: 42 } })
    expect(diff.after).toEqual({ m: { chest: 42 } })
  })

  it('does not treat undefined and absent as different', () => {
    expect(changedFields({ a: 1, b: undefined }, { a: 1 })).toEqual({ before: {}, after: {} })
  })
})

describe('nothingToRecord', () => {
  it('is true for an empty diff', () => {
    expect(nothingToRecord({ before: {}, after: {} })).toBe(true)
  })

  it('is true when only updated_at moved', () => {
    expect(nothingToRecord({ before: { updated_at: 'a' }, after: { updated_at: 'b' } })).toBe(true)
  })

  it('is false when a real field moved alongside updated_at', () => {
    expect(
      nothingToRecord({ before: { name: 'a', updated_at: 'x' }, after: { name: 'b', updated_at: 'y' } }),
    ).toBe(false)
  })
})

describe('the outbox', () => {
  it('records a created row as owing the whole row', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')

    const entries = await db.sync_outbox.toArray()
    const forClient = entries.find((entry) => entry.store === 'clients')
    expect(forClient).toMatchObject({
      id: 'clients:c1',
      store: 'clients',
      row_id: 'c1',
      operation: 'created',
      fields: [],
      attempts: 0,
    })
  })

  it('records an update as owing only the fields that changed', async () => {
    const db = fresh()
    await insertRow(db.clients, { ...client('c1'), phone: '0700' }, 'shop-1')
    await db.sync_outbox.clear()

    await patchRow(db.clients, 'c1', { name: 'Grace' })

    expect((await db.sync_outbox.get('clients:c1'))?.fields).toEqual(['name'])
  })

  /* Ten edits must not become ten pushes: the push reads the row as it stands,
     so one entry carrying the union of fields is enough. */
  it('collapses repeated edits into one entry, accumulating fields', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await db.sync_outbox.clear()

    await patchRow(db.clients, 'c1', { name: 'Grace' })
    await patchRow(db.clients, 'c1', { phone: '0700000123' })

    const entries = (await db.sync_outbox.toArray()).filter((e) => e.store === 'clients')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.fields).toEqual(expect.arrayContaining(['name', 'phone']))
  })

  // The push sends the whole row for a creation, so an edit before the first
  // push has nothing to add.
  it('keeps a row the server has never seen as created', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await patchRow(db.clients, 'c1', { name: 'Grace' })

    expect((await db.sync_outbox.get('clients:c1'))?.operation).toBe('created')
  })

  it('lets a delete outrank a pending create or update', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await softDeleteRow(db.clients, 'c1')

    expect((await db.sync_outbox.get('clients:c1'))?.operation).toBe('deleted')
  })

  it('queues nothing when a write changed nothing', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await db.sync_outbox.clear()

    await patchRow(db.clients, 'c1', { name: 'Amina' })

    expect(await db.sync_outbox.count()).toBe(0)
  })

  /* If recording the debt fails, the row must not exist either. Work recorded
     without the debt would be lost silently, and nobody would know. */
  it('does not keep the row when recording the debt fails', async () => {
    const db = fresh()
    await db.open()

    // db.table(name) and db.<name> are different Table objects in Dexie, and the
    // repository reaches the outbox through the first.
    const spy = vi
      .spyOn(db.table('sync_outbox'), 'put')
      .mockImplementation(() => Promise.reject(new Error('outbox full')) as never)

    await expect(insertRow(db.clients, client('c1'), 'shop-1')).rejects.toThrow(/outbox full/)
    spy.mockRestore()

    expect(await db.clients.get('c1')).toBeUndefined()
    expect(await db.events.count()).toBe(0)
  })

  it('queues nothing when the write itself fails', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await db.sync_outbox.clear()

    await expect(insertRow(db.clients, client('c1'), 'shop-1')).rejects.toThrow()
    expect(await db.sync_outbox.count()).toBe(0)
  })

  /* Events are immutable, so the push finds them with a high-water mark on `at`.
     Queueing them would double every outbox write for nothing. */
  it('does not queue audit events, which push by high-water mark', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')

    expect(await db.events.count()).toBeGreaterThan(0)
    expect((await db.sync_outbox.toArray()).some((entry) => entry.store === 'events')).toBe(false)
  })

  it('carries the updated_at on the row, which is what orders competing edits', async () => {
    const db = fresh()
    const row = client('c1')
    await insertRow(db.clients, row, 'shop-1')

    expect((await db.sync_outbox.get('clients:c1'))?.updated_at).toBe(row.updated_at)
  })
})
