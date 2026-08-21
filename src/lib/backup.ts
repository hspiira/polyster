/* Backup, in both directions (ARCHITECTURE.md D7). Browser storage is not
   permanent, and this file is the only copy off the device. */
import type { PolysterDatabase } from '../db/dexie/database'
import { STORE_NAMES, type StoreName } from '../db/dexie/stores'
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  type ParsedBackup,
} from './backupFile'

export { BACKUP_FORMAT_VERSION }

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exported_at: string
  /** Every store on the device, keyed by store name. */
  data: Record<string, unknown[]>
  counts: Record<string, number>
}

/* The audit log is left out unless asked for. It is the largest store on the
   device and says who changed what, not what the shop currently is. */
export interface BackupOptions {
  includeHistory?: boolean
}

export async function buildBackup(
  db: PolysterDatabase,
  options: BackupOptions = {},
): Promise<Backup> {
  const data: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}

  const stores = options.includeHistory
    ? STORE_NAMES
    : STORE_NAMES.filter((store) => store !== 'events')

  for (const store of stores) {
    const rows = await db.table(store).toArray()
    data[store] = rows
    counts[store] = rows.length
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    data,
    counts,
  }
}

export function backupFilename(shopName: string, at: Date = new Date()): string {
  const slug =
    shopName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'shop'
  return `${slug}-backup-${at.toISOString().slice(0, 10)}.json`
}

/* Triggers the download. Separate from `buildBackup` so the contents can be
   tested without a DOM. */
export function downloadBackup(backup: Backup, filename: string): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()

  // Revoking immediately can cancel the download in some browsers, so this
  // waits a tick. The object is small and the page is about to be idle.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const LAST_BACKUP_KEY = 'tailor_tracker.last_backup_at'

export function recordBackupTaken(at: Date = new Date()): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, at.toISOString())
  } catch {
    // Not worth failing an otherwise successful export over.
  }
}

export function lastBackupAt(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY)
    if (!raw) return null
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

/* Whole days since the last backup. Null if there has never been one, which the
   UI should say plainly rather than showing "0 days ago". */
export function daysSinceBackup(now: Date = new Date()): number | null {
  const last = lastBackupAt()
  if (!last) return null
  return Math.floor((now.getTime() - last.getTime()) / 86_400_000)
}

/* Replaces everything on the device with what the file holds, as one
   transaction: a failure part-way leaves the device exactly as it was. */
export async function restoreBackup(
  db: PolysterDatabase,
  backup: ParsedBackup,
): Promise<RestoreReport> {
  const tables = STORE_NAMES.map((store) => db.table(store))
  const written: { store: StoreName; rows: number }[] = []

  await db.transaction('rw', tables, async () => {
    for (const store of STORE_NAMES) {
      const rows = backup.stores[store] ?? []
      await db.table(store).clear()
      if (rows.length > 0) await db.table(store).bulkAdd(rows)
      if (rows.length > 0) written.push({ store, rows: rows.length })
    }
  })

  return { stores: written, rows: written.reduce((sum, entry) => sum + entry.rows, 0) }
}

export interface RestoreReport {
  stores: { store: StoreName; rows: number }[]
  rows: number
}
