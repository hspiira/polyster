import { useState } from 'preact/hooks'
import { Button, Card, ErrorNote, Screen } from '../../components/ui'
import { useShop } from '../../state/ShopProvider'
import {
  backupFilename,
  buildBackup,
  daysSinceBackup,
  downloadBackup,
  recordBackupTaken,
  type Backup,
} from '../../lib/backup'

export function BackupSettings() {
  const { db, shop } = useShop()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<Backup | null>(null)
  const [days, setDays] = useState<number | null>(() => daysSinceBackup())

  async function exportNow() {
    setBusy(true)
    setError(null)
    try {
      const backup = await buildBackup(db)
      downloadBackup(backup, backupFilename(shop?.name ?? 'shop'))
      recordBackupTaken()
      setDays(0)
      setLastResult(backup)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the backup.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="Backup">
      <div class="space-y-4">
        <Card>
          <p class="text-sm text-gray-600">
            Downloads everything this device holds as a single JSON file: clients, measurements,
            orders, payments, staff, and history.
          </p>
          <p class="mt-2 text-sm text-gray-600">
            Worth doing because a phone's stored data is not guaranteed to last. Clearing site data,
            or the phone reclaiming space, can take it -- and work done offline exists nowhere else
            until it syncs.
          </p>

          <p class="mt-3 text-sm">
            {days === null ? (
              <span class="text-amber-700">No backup has been taken on this device.</span>
            ) : days === 0 ? (
              <span class="text-green-700">Last backup: today.</span>
            ) : (
              <span class={days > 14 ? 'text-amber-700' : 'text-gray-600'}>
                Last backup: {days} {days === 1 ? 'day' : 'days'} ago.
              </span>
            )}
          </p>

          {error && (
            <div class="mt-3">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}

          <Button class="mt-3 w-full" disabled={busy} onClick={() => void exportNow()}>
            {busy ? 'Building...' : 'Download backup'}
          </Button>
        </Card>

        {lastResult && (
          <Card>
            <h2 class="font-medium text-gray-900">What was in it</h2>
            <dl class="mt-2 space-y-1 text-sm">
              {Object.entries(lastResult.counts).map(([table, count]) => (
                <div key={table} class="flex justify-between gap-4">
                  <dt class="text-gray-500">{table.replace(/_/g, ' ')}</dt>
                  <dd class="text-gray-900">{count}</dd>
                </div>
              ))}
            </dl>
            <p class="mt-2 text-xs text-gray-500">
              Worth checking against what you expect. A backup nobody has looked inside is a backup
              nobody knows works.
            </p>
          </Card>
        )}

        <Card>
          <h2 class="font-medium text-gray-900">Restoring</h2>
          <p class="mt-1 text-sm text-gray-600">
            There is no restore button yet. The file is plain JSON, so the data is recoverable by
            hand, but bringing it back into the app is not built. If you are relying on this,
            say so -- it changes what gets built next.
          </p>
        </Card>
      </div>
    </Screen>
  )
}
