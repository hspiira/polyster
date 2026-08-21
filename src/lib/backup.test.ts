import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDatabase, type PolysterDatabase } from '../db/dexie/database'
import { STORE_NAMES } from '../db/dexie/stores'
import { createClient, createShop } from '../db/repo'
import {
  BACKUP_FORMAT_VERSION,
  backupFilename,
  buildBackup,
  daysSinceBackup,
  downloadBackup,
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

describe('buildBackup', () => {
  /* The failure this guards is silent: a store added to the app but not to the
     dump, and nobody finds out until a phone is lost. */
  it('covers every store', async () => {
    const backup = await buildBackup(freshDatabase())
    expect(Object.keys(backup.data).sort()).toEqual([...STORE_NAMES].sort())
    expect(Object.keys(backup.counts).sort()).toEqual([...STORE_NAMES].sort())
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
