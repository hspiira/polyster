import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type PolysterDatabase } from '../dexie/database'
import { createClient, createShop, createStaff, patchRow, softDeleteRow } from '../repo'
import { PUSH_ORDER } from './order'
import { EPOCH, type Row } from './plan'
import { countPending, isDuplicate, pushOutbox, stuckEntries, type Remote } from './push'
import { pullChanges, resetCursors, type Source } from './pull'

const opened: PolysterDatabase[] = []
let counter = 0

function fresh(): PolysterDatabase {
  const db = createDatabase(`sync_${++counter}`)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
})

/* A server in memory. Records every call so the drain's decisions are visible,
   and enforces the same not-older guard the real one does. */
function fakeRemote() {
  const rows = new Map<string, Row>()
  const calls: { kind: 'insert' | 'update'; store: string; id: string; payload: Row }[] = []
  let failOn: ((store: string, id: string) => Error | null) | null = null

  const key = (store: string, id: string) => `${store}:${id}`

  const remote: Remote = {
    async insert(store, payload) {
      const error = failOn?.(store, String(payload.id))
      if (error) throw error
      const at = key(store, String(payload.id))
      if (rows.has(at)) throw Object.assign(new Error('duplicate key value'), { code: '23505' })
      calls.push({ kind: 'insert', store, id: String(payload.id), payload })
      rows.set(at, { ...payload })
    },
    async update(store, id, payload, updatedAt) {
      const error = failOn?.(store, id)
      if (error) throw error
      const at = key(store, id)
      const existing = rows.get(at)
      if (existing && String(existing.updated_at ?? '') > updatedAt) return false
      calls.push({ kind: 'update', store, id, payload })
      rows.set(at, { ...(existing ?? {}), ...payload })
      return true
    },
  }

  return {
    remote,
    rows,
    calls,
    get(store: string, id: string) {
      return rows.get(key(store, id))
    },
    failWith(fn: ((store: string, id: string) => Error | null) | null) {
      failOn = fn
    },
  }
}

function fakeSource(byStore: Partial<Record<string, Row[]>>): Source {
  return {
    async since(store, since, limit) {
      return (byStore[store] ?? [])
        .filter((row) => String(row._modified) > since)
        .sort((a, b) => String(a._modified).localeCompare(String(b._modified)))
        .slice(0, limit)
    },
  }
}

async function shopWithClient(db: PolysterDatabase) {
  const shop = await createShop(db, { name: 'NORTH//FOUND' })
  const staff = await createStaff(db, shop.id, { name: 'Aisha Okello', role: 'owner' })
  const client = await createClient(db, shop.id, { name: 'Grace Nakato' })
  return { shop, staff, client }
}

describe('pushOutbox', () => {
  it('sends every pending row and empties the outbox', async () => {
    const db = fresh()
    await shopWithClient(db)
    const server = fakeRemote()

    const report = await pushOutbox(db, server.remote)

    expect(report.failed).toEqual([])
    expect(report.sent).toBeGreaterThan(0)
    expect(await countPending(db)).toBe(0)
  })

  it('sends the whole row for something the server has never seen', async () => {
    const db = fresh()
    const { client } = await shopWithClient(db)
    const server = fakeRemote()

    await pushOutbox(db, server.remote)

    expect(server.get('clients', client.id)).toMatchObject({
      id: client.id,
      name: 'Grace Nakato',
      shop_id: expect.any(String),
    })
  })

  /* The reason for the whole design. Two devices edit different fields of one
     client; neither loses the other's edit. */
  it('sends only the changed field on an edit, leaving the rest as the server has it', async () => {
    const db = fresh()
    const { client } = await shopWithClient(db)
    const server = fakeRemote()
    await pushOutbox(db, server.remote)

    // Another device set the phone in the meantime.
    server.rows.set(`clients:${client.id}`, {
      ...server.get('clients', client.id),
      phone: '0700 from the other phone',
    })

    await patchRow(db.clients, client.id, { name: 'Grace N.', updated_at: '2026-09-01T00:00:00.000Z' })
    await pushOutbox(db, server.remote)

    const row = server.get('clients', client.id)
    expect(row?.name).toBe('Grace N.')
    expect(row?.phone).toBe('0700 from the other phone')
  })

  it('writes parents before the rows that point at them', async () => {
    const db = fresh()
    await shopWithClient(db)
    const server = fakeRemote()

    await pushOutbox(db, server.remote)

    const order = server.calls.map((call) => call.store)
    expect(order.indexOf('shops')).toBeLessThan(order.indexOf('clients'))
    expect(order.indexOf('shops')).toBeLessThan(order.indexOf('staff'))
  })

  /* A push that succeeded and lost its acknowledgement retries as a create.
     Failing on the duplicate would strand the row forever. */
  it('turns a create the server already has into an update', async () => {
    const db = fresh()
    const { client } = await shopWithClient(db)
    const server = fakeRemote()
    server.rows.set(`clients:${client.id}`, { id: client.id, name: 'stale' })

    const report = await pushOutbox(db, server.remote)

    expect(report.failed).toEqual([])
    expect(server.get('clients', client.id)?.name).toBe('Grace Nakato')
  })

  it('keeps the entry and records the reason when a send fails', async () => {
    const db = fresh()
    const { client } = await shopWithClient(db)
    const server = fakeRemote()
    server.failWith((store) => (store === 'clients' ? new Error('network down') : null))

    const report = await pushOutbox(db, server.remote)

    expect(report.failed).toEqual([{ store: 'clients', rowId: client.id, error: 'network down' }])
    const entry = await db.sync_outbox.get(`clients:${client.id}`)
    expect(entry?.attempts).toBe(1)
    expect(entry?.last_error).toBe('network down')
  })

  it('does not lose other stores when one of them fails', async () => {
    const db = fresh()
    await shopWithClient(db)
    const server = fakeRemote()
    server.failWith((store) => (store === 'clients' ? new Error('network down') : null))

    await pushOutbox(db, server.remote)

    expect(server.rows.has('shops:' + (await db.shops.toArray())[0]!.id)).toBe(true)
  })

  it('counts attempts up across retries, so a stuck row can be reported', async () => {
    const db = fresh()
    await shopWithClient(db)
    const server = fakeRemote()
    server.failWith(() => new Error('still down'))

    for (let i = 0; i < 6; i++) await pushOutbox(db, server.remote)

    const stuck = await stuckEntries(db)
    expect(stuck.length).toBeGreaterThan(0)
    expect(stuck[0]?.attempts).toBe(6)
  })

  /* A row deleted from the store without a soft delete has no state to send.
     Retrying it forever would block its store. */
  it('drops an entry whose row has vanished', async () => {
    const db = fresh()
    const { client } = await shopWithClient(db)
    await db.clients.delete(client.id)
    const server = fakeRemote()

    const report = await pushOutbox(db, server.remote)

    expect(report.dropped).toBeGreaterThan(0)
    expect(await db.sync_outbox.get(`clients:${client.id}`)).toBeUndefined()
  })

  it('sends a soft delete as the stamp, not as a removal', async () => {
    const db = fresh()
    const { client } = await shopWithClient(db)
    const server = fakeRemote()
    await pushOutbox(db, server.remote)

    await softDeleteRow(db.clients, client.id)
    await pushOutbox(db, server.remote)

    const row = server.get('clients', client.id)
    expect(row).toBeDefined()
    expect(row?.deleted_at).toBeTypeOf('string')
  })

  it('sends nothing when there is nothing owed', async () => {
    const db = fresh()
    const server = fakeRemote()
    expect((await pushOutbox(db, server.remote)).sent).toBe(0)
    expect(server.calls).toEqual([])
  })
})

describe('the not-older guard', () => {
  /* An edit made on Monday and pushed on Friday must not overwrite Tuesday's
     edit from another device. */
  it('declines an update the server has already moved past', async () => {
    const db = fresh()
    const { client } = await shopWithClient(db)
    const server = fakeRemote()
    await pushOutbox(db, server.remote)

    server.rows.set(`clients:${client.id}`, {
      ...server.get('clients', client.id),
      name: 'newer, from the other phone',
      updated_at: '2026-12-01T00:00:00.000Z',
    })

    await patchRow(db.clients, client.id, { name: 'older', updated_at: '2026-01-01T00:00:00.000Z' })
    await pushOutbox(db, server.remote)

    expect(server.get('clients', client.id)?.name).toBe('newer, from the other phone')
  })

  it('accepts an update newer than what the server holds', async () => {
    const db = fresh()
    const { client } = await shopWithClient(db)
    const server = fakeRemote()
    await pushOutbox(db, server.remote)

    await patchRow(db.clients, client.id, { name: 'newer', updated_at: '2026-12-01T00:00:00.000Z' })
    await pushOutbox(db, server.remote)

    expect(server.get('clients', client.id)?.name).toBe('newer')
  })
})

describe('pullChanges', () => {
  const remoteClient = (over: Row = {}): Row => ({
    id: 'remote-1',
    shop_id: 'shop-1',
    name: 'From the server',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    phone: null,
    _modified: '2026-08-02T00:00:00.000Z',
    ...over,
  })

  it('writes rows the server has and this device does not', async () => {
    const db = fresh()
    const report = await pullChanges(db, fakeSource({ clients: [remoteClient()] }))

    expect(report.applied).toBe(1)
    expect((await db.clients.get('remote-1'))?.name).toBe('From the server')
  })

  /* Postgres sends null for an unset optional column. Storing that null is what
     made the old replication unusable, because the row type wants it absent. */
  it('stores an unset column as absent rather than null', async () => {
    const db = fresh()
    await pullChanges(db, fakeSource({ clients: [remoteClient()] }))
    expect(await db.clients.get('remote-1')).not.toHaveProperty('phone')
  })

  it('never stores the server cursor column', async () => {
    const db = fresh()
    await pullChanges(db, fakeSource({ clients: [remoteClient()] }))
    expect(await db.clients.get('remote-1')).not.toHaveProperty('_modified')
  })

  it('advances the cursor to the newest row it saw', async () => {
    const db = fresh()
    await pullChanges(
      db,
      fakeSource({
        clients: [
          remoteClient({ id: 'a', _modified: '2026-08-02T00:00:00.000Z' }),
          remoteClient({ id: 'b', _modified: '2026-08-05T00:00:00.000Z' }),
        ],
      }),
    )
    expect((await db.sync_cursors.get('clients'))?.pulled_through).toBe('2026-08-05T00:00:00.000Z')
  })

  it('asks only for what it has not seen on the next run', async () => {
    const db = fresh()
    const source = fakeSource({
      clients: [
        remoteClient({ id: 'a', _modified: '2026-08-02T00:00:00.000Z' }),
        remoteClient({ id: 'b', _modified: '2026-08-05T00:00:00.000Z' }),
      ],
    })
    await pullChanges(db, source)
    const second = await pullChanges(db, source)
    expect(second.applied).toBe(0)
  })

  /* The row on screen has an edit nobody else has seen. Overwriting it with the
     server's older copy would discard work in front of the shop. */
  it('holds back a row this device still owes', async () => {
    const db = fresh()
    const { client } = await shopWithClient(db)

    const report = await pullChanges(
      db,
      fakeSource({ clients: [remoteClient({ id: client.id, name: 'server version' })] }),
    )

    expect(report.heldBack).toBe(1)
    expect(report.applied).toBe(0)
    expect((await db.clients.get(client.id))?.name).toBe('Grace Nakato')
  })

  /* Not advancing past a held-back row would re-deliver the same batch on every
     pull, forever. Its own push brings it back round. */
  it('still advances the cursor past a row it held back', async () => {
    const db = fresh()
    const { client } = await shopWithClient(db)

    await pullChanges(
      db,
      fakeSource({ clients: [remoteClient({ id: client.id, _modified: '2026-09-09T00:00:00.000Z' })] }),
    )

    expect((await db.sync_cursors.get('clients'))?.pulled_through).toBe('2026-09-09T00:00:00.000Z')
  })

  it('applies a soft delete from another device', async () => {
    const db = fresh()
    await pullChanges(db, fakeSource({ clients: [remoteClient()] }))

    await pullChanges(
      db,
      fakeSource({
        clients: [
          remoteClient({ deleted_at: '2026-08-09T00:00:00.000Z', _modified: '2026-08-09T00:00:00.000Z' }),
        ],
      }),
    )

    expect((await db.clients.get('remote-1'))?.deleted_at).toBe('2026-08-09T00:00:00.000Z')
  })

  it('leaves the cursor alone for a store with nothing new', async () => {
    const db = fresh()
    await pullChanges(db, fakeSource({}))
    expect(await db.sync_cursors.count()).toBe(0)
  })

  it('takes everything again after a reset', async () => {
    const db = fresh()
    const source = fakeSource({ clients: [remoteClient()] })
    await pullChanges(db, source)
    await resetCursors(db)

    expect((await pullChanges(db, source)).applied).toBe(1)
  })

  it('walks the stores in dependency order, so a parent arrives first', async () => {
    const db = fresh()
    const asked: string[] = []
    const source: Source = {
      async since(store) {
        asked.push(store)
        return []
      },
    }
    await pullChanges(db, source)
    expect(asked).toEqual([...PUSH_ORDER])
  })
})

describe('isDuplicate', () => {
  it('recognises a unique violation by code', () => {
    expect(isDuplicate({ code: '23505' })).toBe(true)
    expect(isDuplicate({ code: '23000' })).toBe(true)
  })

  it('recognises one by message, since clients word it differently', () => {
    expect(isDuplicate(new Error('duplicate key value violates unique constraint'))).toBe(true)
    expect(isDuplicate(new Error('row already exists'))).toBe(true)
  })

  it('does not mistake anything else for one', () => {
    expect(isDuplicate(new Error('network down'))).toBe(false)
    expect(isDuplicate({ code: '23503' })).toBe(false)
    expect(isDuplicate(null)).toBe(false)
  })
})

describe('EPOCH', () => {
  it('is before anything the server could hold', () => {
    expect(EPOCH < '2000-01-01T00:00:00.000Z').toBe(true)
  })
})
