import { describe, expect, it } from 'vitest'
import { LOCAL_ONLY_STORES, SYNCED_STORES } from '../db/dexie/stores'
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  describeBackup,
  parseBackup,
  parseBackupText,
} from './backupFile'

function file(overrides: Record<string, unknown> = {}) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    exported_at: '2026-08-22T09:00:00.000Z',
    data: { clients: [{ id: 'c1', name: 'Grace' }] },
    counts: { clients: 1 },
    ...overrides,
  }
}

function ok(raw: unknown) {
  const result = parseBackup(raw)
  if (!result.ok) throw new Error(`expected a parse, got: ${result.error}`)
  return result.backup
}

function why(raw: unknown): string {
  const result = parseBackup(raw)
  if (result.ok) throw new Error('expected a rejection')
  return result.error
}

describe('parseBackup', () => {
  it('reads a file the export just wrote', () => {
    const backup = ok(file())
    expect(backup.version).toBe(BACKUP_FORMAT_VERSION)
    expect(backup.exportedAt).toBe('2026-08-22T09:00:00.000Z')
    expect(backup.stores.clients).toHaveLength(1)
    expect(backup.rows).toBe(1)
  })

  it('accepts a file with an empty store', () => {
    expect(ok(file({ data: { clients: [] }, counts: { clients: 0 } })).rows).toBe(0)
  })

  it('takes every store that holds shop data', () => {
    const data = Object.fromEntries(SYNCED_STORES.map((store) => [store, [{ id: `${store}-1` }]]))
    const backup = ok(file({ data, counts: undefined }))
    expect(backup.rows).toBe(SYNCED_STORES.length)
  })

  /* A file naming the outbox is hand-edited or from a version that backed it up
     by mistake. Either way applying it would replay another device's pushes. */
  it('refuses a file carrying sync bookkeeping', () => {
    for (const store of LOCAL_ONLY_STORES) {
      expect(why(file({ data: { [store]: [{ id: 'x' }] }, counts: undefined }))).toMatch(
        /does not know about/,
      )
    }
  })
})

describe('parseBackup rejections', () => {
  it('refuses something that is not an object', () => {
    expect(why(null)).toMatch(/not a Polyster backup/)
    expect(why([])).toMatch(/not a Polyster backup/)
    expect(why('a string')).toMatch(/not a Polyster backup/)
  })

  it('refuses a file that does not name the format', () => {
    expect(why(file({ format: 'something-else' }))).toMatch(/does not say so in its header/)
  })

  it('refuses a version that is not a whole number above zero', () => {
    for (const version of [undefined, 'one', 0, -1, 1.5]) {
      expect(why(file({ version }))).toMatch(/does not say which version/)
    }
  })

  /* The important one. Reading a newer file as far as it goes would look like a
     whole restore while quietly dropping whatever the new version added. */
  it('refuses a backup from a newer app rather than reading part of it', () => {
    const error = why(file({ version: BACKUP_FORMAT_VERSION + 1 }))
    expect(error).toMatch(/newer version of Polyster/)
    expect(error).toMatch(/Update the app first/)
  })

  it('refuses a file with no data', () => {
    expect(why(file({ data: undefined }))).toMatch(/no data in it/)
    expect(why(file({ data: [] }))).toMatch(/no data in it/)
  })

  /* Skipping an unknown store would silently discard records on a restore that
     reported success. */
  it('refuses a store it does not know, naming it', () => {
    const error = why(file({ data: { clients: [], warranties: [{ id: 'w1' }] }, counts: undefined }))
    expect(error).toMatch(/"warranties"/)
    expect(error).toMatch(/would lose those records/)
  })

  it('refuses a store that is not a list', () => {
    expect(why(file({ data: { clients: { id: 'c1' } }, counts: undefined }))).toMatch(
      /not a list of records/,
    )
  })

  it('refuses a record that is not an object', () => {
    expect(why(file({ data: { clients: ['c1'] }, counts: undefined }))).toMatch(
      /not a record/,
    )
  })

  it('refuses a record with no usable id', () => {
    for (const row of [{}, { id: '' }, { id: 7 }, { id: null }]) {
      expect(why(file({ data: { clients: [row] }, counts: undefined }))).toMatch(/has no id/)
    }
  })

  // bulkAdd would throw half way through, and the id tells nobody which file.
  it('refuses the same id twice in one store', () => {
    expect(
      why(file({ data: { clients: [{ id: 'c1' }, { id: 'c1' }] }, counts: undefined })),
    ).toMatch(/lists the same record twice/)
  })

  it('refuses a file whose counts disagree with its rows', () => {
    const error = why(file({ counts: { clients: 9 } }))
    expect(error).toMatch(/looks incomplete/)
    expect(error).toMatch(/says "clients" has 9 records but holds 1/)
  })

  it('ignores counts that are not numbers rather than refusing', () => {
    expect(ok(file({ counts: { clients: 'one' } })).rows).toBe(1)
  })

  it('tolerates a missing exported_at', () => {
    expect(ok(file({ exported_at: undefined })).exportedAt).toBe('')
  })
})

describe('parseBackupText', () => {
  it('reads the text the download writes', () => {
    const result = parseBackupText(JSON.stringify(file(), null, 2))
    expect(result.ok).toBe(true)
  })

  it('refuses text that is not JSON, without throwing', () => {
    const result = parseBackupText('{ not json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/not readable as JSON/)
  })

  it('refuses an empty file', () => {
    expect(parseBackupText('').ok).toBe(false)
  })
})

describe('describeBackup', () => {
  it('lists only the stores that hold something, for the confirmation', () => {
    const backup = ok(
      file({ data: { clients: [{ id: 'c1' }], orders: [] }, counts: undefined }),
    )
    expect(describeBackup(backup)).toEqual([{ store: 'clients', rows: 1 }])
  })

  it('reports in the order the stores are declared', () => {
    const backup = ok(
      file({
        data: { payments: [{ id: 'p1' }], shops: [{ id: 's1' }] },
        counts: undefined,
      }),
    )
    expect(describeBackup(backup).map((entry) => entry.store)).toEqual(['shops', 'payments'])
  })
})
