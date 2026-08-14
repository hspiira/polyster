/* Install, which for an offline-first app is the difference between working and
   not. Chromium fires `beforeinstallprompt`; iOS gets instructions instead. */
import { useCallback, useEffect, useState } from 'preact/hooks'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallState {
  canPrompt: boolean
  isStandalone: boolean
  isIos: boolean
  prompt(): Promise<void>
}

function detectStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag, which predates the media query.
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function detectIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function useInstallPrompt(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setStandalone] = useState(detectStandalone)

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setDeferred(null)
      setStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const prompt = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    // The event is single-use: Chromium refuses a second prompt() on it.
    setDeferred(null)
  }, [deferred])

  return { canPrompt: deferred !== null, isStandalone, isIos: detectIos(), prompt }
}
