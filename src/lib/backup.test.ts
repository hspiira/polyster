import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type PolysterDatabase } from '../db/dexie/database'
import { LOCAL_ONLY_STORES, STORE_NAMES, SYNCED_STORES } from '../db/dexie/stores'
import { createClient, createShop } from '../db/repo'
import { parseBackup, BACKUP_FORMAT } from './backupFile'
import {
  BACKUP_FORMAT_VERSION,
  backupFilename,
  buildBackup,
  daysSinceBackup,
  downloadBackup,
  restoreBackup,
  lastBackupAt,
  recordBackupTaken,
  type Backup,
} from './backup'

const opened: PolysterDatabase[] = []
let counter = 0

function freshDatabase(): PolysterDatabase {
  const db = createDatabase(`backup_${++counter}`)
  opened.push(db)
  return db
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close()
    await db.delete()
  }
  localStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Shop data only: sync bookkeeping is deliberately not restored. */
async function snapshot(db: PolysterDatabase): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {}
  for (const store of SYNCED_STORES) out[store] = await db.table(store).toArray()
  return out
}

function file() {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    exported_at: '2026-08-22T09:00:00.000Z',
    data: { clients: [{ id: 'c1', shop_id: 's1', name: 'From the file' }] },
  }
}

describe('buildBackup', () => {
  /* Guards a silent failure: a store added to the app but not to the dump.
     `events` is the one deliberate omission, so it is named rather than filtered. */
  it('covers every store but the audit log', async () => {
    const expected = SYNCED_STORES.filter((store) => store !== 'events').sort()
    const backup = await buildBackup(freshDatabase())
    expect(Object.keys(backup.data).sort()).toEqual(expected)
    expect(Object.keys(backup.counts).sort()).toEqual(expected)
  })

  it('covers every store when history is asked for', async () => {
    const backup = await buildBackup(freshDatabase(), { includeHistory: true })
    expect(Object.keys(backup.data).sort()).toEqual([...SYNCED_STORES].sort())
  })

  /* The outbox is this device's pending pushes and the cursors are its place in
     the server's history. Restoring either onto another device is wrong. */
  it('never carries the sync bookkeeping this device keeps', async () => {
    const backup = await buildBackup(freshDatabase(), { includeHistory: true })
    for (const store of LOCAL_ONLY_STORES) {
      expect(Object.keys(backup.data)).not.toContain(store)
    }
  })

  it('is an empty but complete dump for a shop with nothing in it', async () => {
    const backup = await buildBackup(freshDatabase())
    expect(Object.values(backup.counts).every((n) => n === 0)).toBe(true)
    expect(backup.format).toBe('tailor-tracker-backup')
    expect(backup.version).toBe(BACKUP_FORMAT_VERSION)
  })

  it('captures rows that were written', async () => {
    const db = freshDatabase()
    const shop = await createShop(db, { name: 'Kampala Tailors' })
    await createClient(db, shop.id, { name: 'Mrs. Okello', phone: '0700000000' })

    const backup = await buildBackup(db)

    expect(backup.counts.shops).toBe(1)
    expect(backup.counts.clients).toBe(1)
    expect(backup.data.clients?.[0]).toMatchObject({ name: 'Mrs. Okello', phone: '0700000000' })
  })

  /* A count that disagrees with the rows would have someone believe a backup
     holds work it does not. */
  it('never reports a count that disagrees with the rows', async () => {
    const db = freshDatabase()
    const shop = await createShop(db, { name: 'Kampala Tailors' })
    for (const name of ['Ama', 'Ben', 'Cara']) await createClient(db, shop.id, { name })

    const backup = await buildBackup(db)

    for (const table of STORE_NAMES) {
      expect(backup.counts[table]).toBe(backup.data[table]?.length)
    }
    expect(backup.counts.clients).toBe(3)
  })

  it('survives a round trip through JSON, which is how it is written out', async () => {
    const db = freshDatabase()
    const shop = await createShop(db, { name: 'Kampala Tailors' })
    await createClient(db, shop.id, { name: 'Mrs. Okello' })

    const backup = await buildBackup(db)
    expect(JSON.parse(JSON.stringify(backup))).toEqual(backup)
  })

  it('stamps when it was taken', async () => {
    const backup = await buildBackup(freshDatabase())
    expect(Number.isNaN(Date.parse(backup.exported_at))).toBe(false)
  })
})

describe('backupFilename', () => {
  const at = new Date('2026-08-14T09:00:00.000Z')

  it('slugs the shop name and dates the file', () => {
    expect(backupFilename('Kampala Tailors', at)).toBe('kampala-tailors-backup-2026-08-14.json')
  })

  it('collapses punctuation rather than emitting it', () => {
    expect(backupFilename("Ama's Cuts & Co.", at)).toBe('ama-s-cuts-co-backup-2026-08-14.json')
  })

  /* A name with nothing ASCII in it must still produce a usable filename. */
  it('falls back when the name slugs away to nothing', () => {
    expect(backupFilename('！！！', at)).toBe('shop-backup-2026-08-14.json')
    expect(backupFilename('', at)).toBe('shop-backup-2026-08-14.json')
  })
})

describe('recordBackupTaken and lastBackupAt', () => {
  it('reports nothing before a backup has ever been taken', () => {
    expect(lastBackupAt()).toBeNull()
    expect(daysSinceBackup()).toBeNull()
  })

  it('remembers when one was taken', () => {
    const at = new Date('2026-08-14T09:00:00.000Z')
    recordBackupTaken(at)
    expect(lastBackupAt()?.toISOString()).toBe(at.toISOString())
  })

  it('ignores a stored value that is not a date', () => {
    localStorage.setItem('tailor_tracker.last_backup_at', 'not a date')
    expect(lastBackupAt()).toBeNull()
    expect(daysSinceBackup()).toBeNull()
  })

  /* Storage throws rather than returning null when blocked, and a failed write
     must not fail an export that already succeeded. */
  it('does not throw when storage is unavailable', () => {
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('blocked')
        },
      },
    })

    expect(() => recordBackupTaken()).not.toThrow()
    expect(lastBackupAt()).toBeNull()

    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
  })
})

describe('daysSinceBackup', () => {
  const taken = new Date('2026-08-01T09:00:00.000Z')

  it('counts whole days only', () => {
    recordBackupTaken(taken)
    expect(daysSinceBackup(new Date('2026-08-04T08:59:00.000Z'))).toBe(2)
    expect(daysSinceBackup(new Date('2026-08-04T09:00:00.000Z'))).toBe(3)
  })

  /* "0 days ago" and "never" mean very different things to a shop, so the
     first must not be able to stand in for the second. */
  it('says zero on the day it was taken, which is not the same as never', () => {
    recordBackupTaken(taken)
    expect(daysSinceBackup(new Date('2026-08-01T23:00:00.000Z'))).toBe(0)
    expect(daysSinceBackup(new Date('2026-08-01T23:00:00.000Z'))).not.toBeNull()
  })
})

describe('downloadBackup', () => {
  const backup: Backup = {
    format: 'tailor-tracker-backup',
    version: 1,
    exported_at: '2026-08-14T09:00:00.000Z',
    data: { clients: [{ id: 'c1' }] },
    counts: { clients: 1 },
  }

  it('hands the browser the filename and the whole backup as JSON', () => {
    const link = { href: '', download: '', click: vi.fn() }
    const createElement = vi.fn(() => link as unknown as HTMLAnchorElement)
    let written: Blob | undefined

    vi.stubGlobal('document', { createElement })
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        written = blob
        return 'blob:fake'
      },
      revokeObjectURL: vi.fn(),
    })

    downloadBackup(backup, 'kampala-backup-2026-08-14.json')

    expect(createElement).toHaveBeenCalledWith('a')
    expect(link.download).toBe('kampala-backup-2026-08-14.json')
    expect(link.href).toBe('blob:fake')
    expect(link.click).toHaveBeenCalledOnce()
    expect(written?.type).toBe('application/json')
  })

  /* Revoking the URL before the browser has read it cancels the download. */
  it('holds the object URL past the click', async () => {
    vi.useFakeTimers()
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('document', {
      createElement: () => ({ href: '', download: '', click: vi.fn() }),
    })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:fake', revokeObjectURL })

    downloadBackup(backup, 'x.json')
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })
})

describe('restoreBackup', () => {
  it('puts back exactly what the export took, store for store', async () => {
    const db = freshDatabase()
    const shop = await createShop(db, { name: 'Kampala Tailors' })
    for (const name of ['Ama', 'Ben', 'Cara']) await createClient(db, shop.id, { name })

    const exported = await buildBackup(db, { includeHistory: true })
    const before = await snapshot(db)

    // A different device: everything gone, then the file applied.
    for (const store of STORE_NAMES) await db.table(store).clear()
    expect((await snapshot(db)).clients).toEqual([])

    const parsed = parseBackup(JSON.parse(JSON.stringify(exported)))
    if (!parsed.ok) throw new Error(parsed.error)
    const report = await restoreBackup(db, parsed.backup)

    expect(await snapshot(db)).toEqual(before)
    expect(report.rows).toBe(parsed.backup.rows)
  })

  /* A restored device has no standing with the server: the rows came from a
     file, not from a sync. It has to push everything and pull everything. */
  it('clears the sync bookkeeping, so the device starts over with the server', async () => {
    const db = freshDatabase()
    const shop = await createShop(db, { name: 'Kampala Tailors' })
    await createClient(db, shop.id, { name: 'Ama' })
    await db.sync_cursors.put({ id: 'clients', pulled_through: 'x', at: 'x' })
    expect(await db.sync_outbox.count()).toBeGreaterThan(0)

    const parsed = parseBackup(await buildBackup(db))
    if (!parsed.ok) throw new Error(parsed.error)
    await restoreBackup(db, parsed.backup)

    expect(await db.sync_outbox.count()).toBe(0)
    expect(await db.sync_cursors.count()).toBe(0)
  })

  it('replaces what is there rather than merging into it', async () => {
    const db = freshDatabase()
    const shop = await createShop(db, { name: 'Kampala Tailors' })
    await createClient(db, shop.id, { name: 'Ama' })
    const exported = await buildBackup(db)

    await createClient(db, shop.id, { name: 'Should not survive' })
    expect(await db.clients.count()).toBe(2)

    const parsed = parseBackup(exported)
    if (!parsed.ok) throw new Error(parsed.error)
    await restoreBackup(db, parsed.backup)

    const names = (await db.clients.toArray()).map((row) => row.name)
    expect(names).toEqual(['Ama'])
  })

  /* The default export leaves history out, so restoring it clears the log on
     the device rather than restoring one. Replace means replace. */
  it('does not bring history back when the file has none', async () => {
    const db = freshDatabase()
    const shop = await createShop(db, { name: 'Kampala Tailors' })
    await createClient(db, shop.id, { name: 'Ama' })
    expect(await db.events.count()).toBeGreaterThan(0)

    const parsed = parseBackup(await buildBackup(db))
    if (!parsed.ok) throw new Error(parsed.error)
    await restoreBackup(db, parsed.backup)

    expect(await db.clients.count()).toBe(1)
    expect(await db.events.count()).toBe(0)
  })

  /* A failure part way through must leave the device as it was. The file has to
     differ from the device, or a partial restore looks like a whole one. */
  it('leaves the device untouched when a row cannot be written', async () => {
    const db = freshDatabase()
    const shop = await createShop(db, { name: 'Kampala Tailors' })
    await createClient(db, shop.id, { name: 'Ama' })

    const parsed = parseBackup(await buildBackup(db))
    if (!parsed.ok) throw new Error(parsed.error)

    // Written after the export, so the file no longer matches the device.
    await createClient(db, shop.id, { name: 'Added after the export' })
    const before = await snapshot(db)
    expect(await db.clients.count()).toBe(2)

    // A key IndexedDB refuses, in a store reached after clients was replaced.
    parsed.backup.stores.payments = [{ id: { bad: true } as unknown as string }]

    await expect(restoreBackup(db, parsed.backup)).rejects.toThrow()
    expect(await db.clients.count()).toBe(2)
    expect(await snapshot(db)).toEqual(before)
  })

  it('restores an empty backup as an empty device', async () => {
    const db = freshDatabase()
    const shop = await createShop(db, { name: 'Kampala Tailors' })
    await createClient(db, shop.id, { name: 'Ama' })

    const parsed = parseBackup(file())
    if (!parsed.ok) throw new Error(parsed.error)
    await restoreBackup(db, parsed.backup)

    expect(await db.clients.count()).toBe(1)
    expect(await db.shops.count()).toBe(0)
  })
})

describe('buildBackup and history', () => {
  /* The audit log is the largest store on the device and describes who changed
     what, not what the shop is. A restore needs the second, not the first. */
  it('leaves the audit log out by default', async () => {
    const db = freshDatabase()
    const shop = await createShop(db, { name: 'Kampala Tailors' })
    await createClient(db, shop.id, { name: 'Ama' })

    const backup = await buildBackup(db)
    expect(backup.data).not.toHaveProperty('events')
    expect(backup.counts).not.toHaveProperty('events')
    expect(backup.data.clients).toHaveLength(1)
  })

  it('includes it when asked', async () => {
    const db = freshDatabase()
    const shop = await createShop(db, { name: 'Kampala Tailors' })
    await createClient(db, shop.id, { name: 'Ama' })

    const backup = await buildBackup(db, { includeHistory: true })
    expect(backup.counts.events).toBeGreaterThan(0)
  })

  it('is smaller without the log than with it', async () => {
    const db = freshDatabase()
    const shop = await createShop(db, { name: 'Kampala Tailors' })
    for (const name of ['Ama', 'Ben', 'Cara']) await createClient(db, shop.id, { name })

    const lean = JSON.stringify(await buildBackup(db)).length
    const full = JSON.stringify(await buildBackup(db, { includeHistory: true })).length
    expect(lean).toBeLessThan(full)
  })
})
