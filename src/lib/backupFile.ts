/* Reading a backup file. Pure and total: every rejection is a sentence the
   person holding the file can act on. Writing one is in ./backup.ts. */
import { STORE_NAMES, type StoreName } from '../db/dexie/stores'

export const BACKUP_FORMAT = 'tailor-tracker-backup'
export const BACKUP_FORMAT_VERSION = 1

/** A row from a backup. Every store is keyed by a string id. */
export interface BackupRow {
  id: string
  [key: string]: unknown
}

export interface ParsedBackup {
  version: number
  exportedAt: string
  stores: Partial<Record<StoreName, BackupRow[]>>
  rows: number
}

export type ParseResult = { ok: true; backup: ParsedBackup } | { ok: false; error: string }

function fail(error: string): ParseResult {
  return { ok: false, error }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const KNOWN = new Set<string>(STORE_NAMES)

/** Parses text straight from a file, so a malformed file reads as a rejection. */
export function parseBackupText(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return fail('That file is not a Polyster backup -- it is not readable as JSON.')
  }
  return parseBackup(raw)
}

export function parseBackup(raw: unknown): ParseResult {
  if (!isObject(raw)) return fail('That file is not a Polyster backup.')

  if (raw.format !== BACKUP_FORMAT) {
    return fail('That file is not a Polyster backup -- it does not say so in its header.')
  }

  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) {
    return fail('That backup does not say which version it is, so it cannot be trusted.')
  }

  /* A newer file is refused rather than read as far as it goes: this app cannot
     know what a later version added, and a partial restore looks like a whole one. */
  if (raw.version > BACKUP_FORMAT_VERSION) {
    return fail(
      `That backup was made by a newer version of Polyster (format ${raw.version}, ` +
        `this app reads ${BACKUP_FORMAT_VERSION}). Update the app first.`,
    )
  }

  if (!isObject(raw.data)) return fail('That backup has no data in it.')

  const stores: Partial<Record<StoreName, BackupRow[]>> = {}
  let rows = 0

  for (const [name, value] of Object.entries(raw.data)) {
    /* Refused, not skipped. A store this app does not know means the file holds
       records that would silently vanish on restore. */
    if (!KNOWN.has(name)) {
      return fail(
        `That backup holds "${name}", which this app does not know about. ` +
          'Restoring it would lose those records. Update the app first.',
      )
    }

    if (!Array.isArray(value)) {
      return fail(`That backup is damaged: "${name}" is not a list of records.`)
    }

    const checked: BackupRow[] = []
    for (const row of value) {
      if (!isObject(row)) {
        return fail(`That backup is damaged: "${name}" holds something that is not a record.`)
      }
      if (typeof row.id !== 'string' || row.id === '') {
        return fail(`That backup is damaged: a record in "${name}" has no id.`)
      }
      checked.push(row as BackupRow)
    }

    const ids = new Set(checked.map((row) => row.id))
    if (ids.size !== checked.length) {
      return fail(`That backup is damaged: "${name}" lists the same record twice.`)
    }

    stores[name as StoreName] = checked
    rows += checked.length
  }

  /* The export writes counts alongside the data, so a disagreement means the
     file was truncated or edited. Cheap to check, and it catches a half download. */
  if (isObject(raw.counts)) {
    for (const [name, expected] of Object.entries(raw.counts)) {
      const actual = stores[name as StoreName]?.length ?? 0
      if (typeof expected === 'number' && expected !== actual) {
        return fail(
          `That backup looks incomplete: it says "${name}" has ${expected} records ` +
            `but holds ${actual}. It may not have finished downloading.`,
        )
      }
    }
  }

  const exportedAt = typeof raw.exported_at === 'string' ? raw.exported_at : ''

  return { ok: true, backup: { version: raw.version, exportedAt, stores, rows } }
}

/** What a restore would do, for the confirmation the UI has to show first. */
export function describeBackup(backup: ParsedBackup): { store: StoreName; rows: number }[] {
  return STORE_NAMES.filter((store) => (backup.stores[store]?.length ?? 0) > 0).map((store) => ({
    store,
    rows: backup.stores[store]?.length ?? 0,
  }))
}
