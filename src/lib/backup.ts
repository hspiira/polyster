/**
 * Export backup (ARCHITECTURE.md D7, Phase 1 step 10).
 *
 * Browser storage is not guaranteed permanent. A device can have its site data
 * cleared by the user, by the OS reclaiming space, or by someone tapping the
 * wrong thing in settings -- and for a shop whose only copy of an offline
 * week's work is that IndexedDB, that is a real risk rather than a theoretical
 * one. This is the cheap mitigation: a JSON file the shop can put anywhere.
 *
 * Deliberately a plain dump rather than a curated format. The value of a
 * backup is that it contains everything; a backup that filters is a backup
 * that surprises you when you need it.
 */
import type { AppDatabase } from '../db/database'
import { REPLICATED_TABLES } from '../db/replication'

export const BACKUP_FORMAT_VERSION = 1

export interface Backup {
  format: 'tailor-tracker-backup'
  version: number
  exported_at: string
  /** Every replicated collection, keyed by collection name. */
  data: Record<string, unknown[]>
  counts: Record<string, number>
}

export async function buildBackup(db: AppDatabase): Promise<Backup> {
  const data: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}

  for (const table of REPLICATED_TABLES) {
    const docs = await db.collections[table].find().exec()
    const rows = docs.map((doc) => doc.toJSON())
    data[table] = rows
    counts[table] = rows.length
  }

  return {
    format: 'tailor-tracker-backup',
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

/**
 * Triggers the download. Kept separate from `buildBackup` so the contents can
 * be tested without a DOM.
 */
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

/**
 * How long since the last backup, in whole days. Null if there has never been
 * one -- which the UI should say plainly rather than showing "0 days ago".
 */
export function daysSinceBackup(now: Date = new Date()): number | null {
  const last = lastBackupAt()
  if (!last) return null
  return Math.floor((now.getTime() - last.getTime()) / 86_400_000)
}
