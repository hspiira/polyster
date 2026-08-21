import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDatabase, type PolysterDatabase } from '../dexie/database'
import type { ClientDoc } from '../schema'
import {
  alive,
  buildEvent,
  getActor,
  gone,
  insertRow,
  loadOrThrow,
  missing,
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
    expect(events[0]?.after).toMatchObject({ name: 'Amina' })
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

  it('records both sides of the change', async () => {
    const db = fresh()
    await insertRow(db.clients, client('c1'), 'shop-1')
    await patchRow(db.clients, 'c1', { name: 'Grace' })

    const event = (await db.events.toArray()).find((row) => row.action === 'updated')
    expect(event?.before).toMatchObject({ name: 'Amina' })
    expect(event?.after).toMatchObject({ name: 'Grace' })
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
    expect(event?.before).toMatchObject({ name: 'Amina' })
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
