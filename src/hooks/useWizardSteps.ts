/**
 * Wizard step state that Android's back gesture understands.
 *
 * The entry flow shows no back arrow, so back is swipe on iOS and the system
 * gesture on Android. With steps held in plain state that gesture leaves the
 * app instead of stepping back -- so each step is a real history entry.
 */
import { useCallback, useEffect, useState } from 'preact/hooks'

const STATE_KEY = 'polyster.wizardStep'

export interface WizardSteps<T extends string> {
  step: T
  /** Advances and pushes a history entry. */
  goTo(step: T): void
  /** Replaces the current entry, for a step that must not be returned to. */
  replaceWith(step: T): void
}

export function useWizardSteps<T extends string>(steps: readonly T[], first: T): WizardSteps<T> {
  const [step, setStep] = useState<T>(first)

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const next = (event.state as Record<string, unknown> | null)?.[STATE_KEY]
      setStep(typeof next === 'string' && steps.includes(next as T) ? (next as T) : first)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [steps, first])

  const goTo = useCallback((next: T) => {
    window.history.pushState({ [STATE_KEY]: next }, '')
    setStep(next)
  }, [])

  const replaceWith = useCallback((next: T) => {
    window.history.replaceState({ [STATE_KEY]: next }, '')
    setStep(next)
  }, [])

  return { step, goTo, replaceWith }
}
