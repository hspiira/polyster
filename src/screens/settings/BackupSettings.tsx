import { useState } from 'preact/hooks'
import { Button, Card, ErrorNote, InfoNote, Screen, SectionTitle } from '../../components/ui'
import { IconAlert, IconCheck, IconDownload } from '../../components/icons'
import { useShop } from '../../state/ShopProvider'
import {
  backupFilename,
  buildBackup,
  daysSinceBackup,
  downloadBackup,
  recordBackupTaken,
  type Backup,
} from '../../lib/backup'
import { useBack } from '../../hooks/useBack'

export function BackupSettings() {
  const back = useBack()
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

  const stale = days === null || days > 14

  return (
    <Screen title="Backup" back={back}>
      <div class="space-y-5">
        <div
          class={`rounded-card p-4 ${
            stale
              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
              : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
          }`}
        >
          <div class="flex items-center gap-2 text-sm font-medium">
            {stale ? <IconAlert size={18} /> : <IconCheck size={18} />}
            {days === null
              ? 'No backup taken on this device'
              : days === 0
                ? 'Backed up today'
                : `Last backup ${days} ${days === 1 ? 'day' : 'days'} ago`}
          </div>
          <p class="mt-1.5 text-sm opacity-90">
            A phone's stored data is not guaranteed to last. Clearing site data, or the phone
            reclaiming space, can take it -- and work done offline exists nowhere else until it
            syncs.
          </p>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button block disabled={busy} onClick={() => void exportNow()}>
          <IconDownload size={18} /> {busy ? 'Building...' : 'Download backup'}
        </Button>

        {lastResult && (
          <section>
            <SectionTitle>What was in it</SectionTitle>
            <Card>
              <dl class="space-y-1 text-sm">
                {Object.entries(lastResult.counts).map(([table, count]) => (
                  <div key={table} class="flex justify-between gap-4">
                    <dt class="text-stone-500 dark:text-stone-400">{table.replace(/_/g, ' ')}</dt>
                    <dd class="font-medium tabular-nums">{count}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <div class="mt-2">
              <InfoNote>
                Worth checking against what you expect. A backup nobody has looked inside is a
                backup nobody knows works.
              </InfoNote>
            </div>
          </section>
        )}

        <section>
          <SectionTitle>Restoring</SectionTitle>
          <Card>
            <p class="text-sm text-stone-600 dark:text-stone-300">
              There is no restore button yet. The file is plain JSON, so the data is recoverable by
              hand, but bringing it back into the app is not built. If you are relying on this, say
              so -- it changes what gets built next.
            </p>
          </Card>
        </section>
      </div>
    </Screen>
  )
}
