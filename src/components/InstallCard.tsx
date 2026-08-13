/**
 * The permanent way to install, for anyone who dismissed the prompt on Today.
 *
 * That prompt writes a "never again" flag to localStorage, so without a second
 * entry point one "Not now" left an Android user with no way to install from
 * inside the app -- on an offline-first app, where installing is the difference
 * between working with no signal and not.
 *
 * Hidden once installed: there is nothing left to offer, and a row that does
 * nothing is worse than no row.
 */
import { Button, Card, InfoNote } from '../ui'
import { IconCheck, IconDownload } from './icons'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

export function InstallCard() {
  const install = useInstallPrompt()

  if (install.isStandalone) {
    return (
      <Card>
        <p class="flex items-center gap-2 text-sm text-content-muted">
          <IconCheck size={18} class="shrink-0 text-success" />
          Installed on this device.
        </p>
      </Card>
    )
  }

  // iOS never fires `beforeinstallprompt`, so there is no button to offer --
  // only the menu path, which has to be described rather than triggered.
  if (install.isIos) {
    return (
      <Card>
        <p class="text-sm text-content-muted">
          In Safari, tap the Share button, then <span class="text-content">Add to Home Screen</span>
          . Polyster then opens like any other app, with no internet needed.
        </p>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <p class="text-sm text-content-muted">
          Installing puts Polyster on your home screen and lets it open with no internet. In a
          browser tab it can be lost when you close it.
        </p>
        <Button block class="mt-3" disabled={!install.canPrompt} onClick={() => void install.prompt()}>
          <IconDownload size={18} /> Add to home screen
        </Button>
      </Card>

      {/*
        Chromium decides when the install prompt is available -- it needs the
        service worker registered and its own engagement rules met -- so the
        button can be there with nothing behind it. Saying so beats a button
        that silently does nothing.
      */}
      {!install.canPrompt && (
        <div class="mt-2">
          <InfoNote>
            Not ready yet. Your browser offers this once it has loaded the app fully -- or use its
            menu, where this is "Install app" or "Add to Home screen".
          </InfoNote>
        </div>
      )}
    </>
  )
}
