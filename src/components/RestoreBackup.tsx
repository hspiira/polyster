/* Choosing a backup file and applying it. Shared, because the screen that needs
   it most is the landing screen: a new phone has no shop to reach Settings by. */
import { useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { Button, Card, ErrorNote, Sheet } from '../ui'
import { forgetActiveStaff, useShop } from '../state/ShopProvider'
import { restoreBackup } from '../lib/backup'
import { describeBackup, parseBackupText, type ParsedBackup } from '../lib/backupFile'

export interface RestoreBackupProps {
  /** Renders the trigger, so the landing screen and Settings can look different. */
  children: (open: () => void, busy: boolean) => ComponentChildren
  onError?: (message: string | null) => void
}

export function RestoreBackup({ children, onError }: RestoreBackupProps) {
  const { db } = useShop()
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ParsedBackup | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function report(message: string | null) {
    setError(message)
    onError?.(message)
  }

  async function chooseFile(event: Event) {
    report(null)
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    // Cleared so choosing the same file twice still fires a change.
    input.value = ''
    if (!file) return

    const result = parseBackupText(await file.text())
    if (!result.ok) {
      report(result.error)
      return
    }
    setPending(result.backup)
  }

  async function confirm() {
    if (!pending) return
    setRestoring(true)
    report(null)
    try {
      await restoreBackup(db, pending)
      /* The session points at a staff id the file may not hold, and every screen
         is showing rows that no longer exist. Reload rather than patch. */
      forgetActiveStaff()
      window.location.reload()
    } catch (err) {
      report(err instanceof Error ? err.message : 'Could not restore that backup.')
      setRestoring(false)
      setPending(null)
    }
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        class="hidden"
        onChange={(event) => void chooseFile(event)}
      />
      {children(() => fileInput.current?.click(), restoring)}
      {!onError && error && <ErrorNote>{error}</ErrorNote>}

      <Sheet
        open={pending !== null}
        title="Replace everything on this phone?"
        onClose={() => setPending(null)}
      >
        {pending && (
          <div class="space-y-4">
            <p class="text-sm leading-relaxed text-content-muted">
              This phone's records will be deleted and replaced with what the file holds. Anything
              recorded here since that backup was taken will be gone.
            </p>

            <Card>
              <dl class="space-y-1 text-sm">
                {describeBackup(pending).map((entry) => (
                  <div key={entry.store} class="flex justify-between gap-4">
                    <dt class="text-content-muted">{entry.store.replace(/_/g, ' ')}</dt>
                    <dd class="font-medium tabular-nums">{entry.rows}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            {pending.exportedAt && (
              <p class="text-sm text-content-muted">Taken {pending.exportedAt.slice(0, 10)}.</p>
            )}

            <div class="flex gap-2 pt-1">
              <Button
                variant="secondary"
                class="flex-1"
                type="button"
                onClick={() => setPending(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                class="flex-1"
                disabled={restoring}
                onClick={() => void confirm()}
              >
                {restoring ? 'Restoring...' : 'Replace everything'}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  )
}
