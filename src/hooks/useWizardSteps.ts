/* Each step is a real history entry, so system back steps rather than leaving.
   `canGoBack` stops the app's own swipe walking off the first step. */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

const STEP_KEY = 'polyster.wizardStep'
const DEPTH_KEY = 'polyster.wizardDepth'

export interface WizardSteps<T extends string> {
  step: T
  /** True when a step has been pushed, so back stays inside the wizard. */
  canGoBack: boolean
  /** Advances and pushes a history entry. */
  goTo(step: T): void
  /** Replaces the current entry, for a step that must not be returned to. */
  replaceWith(step: T): void
  goBack(): void
}

export function useWizardSteps<T extends string>(steps: readonly T[], first: T): WizardSteps<T> {
  const [step, setStep] = useState<T>(first)
  const [canGoBack, setCanGoBack] = useState(false)
  // A ref so `goTo` can read the current depth without being rebuilt on every
  // step change, which would re-run the effects of anything holding it.
  const depth = useRef(0)

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const state = event.state as Record<string, unknown> | null
      const nextStep = state?.[STEP_KEY]
      const nextDepth = state?.[DEPTH_KEY]

      setStep(typeof nextStep === 'string' && steps.includes(nextStep as T) ? (nextStep as T) : first)
      // No depth on the entry means we have popped back to whatever preceded
      // the wizard, so there is nothing left of it to go back through.
      depth.current = typeof nextDepth === 'number' ? nextDepth : 0
      setCanGoBack(depth.current > 0)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [steps, first])

  const goTo = useCallback((next: T) => {
    depth.current += 1
    window.history.pushState({ [STEP_KEY]: next, [DEPTH_KEY]: depth.current }, '')
    setStep(next)
    setCanGoBack(true)
  }, [])

  const replaceWith = useCallback((next: T) => {
    window.history.replaceState({ [STEP_KEY]: next, [DEPTH_KEY]: depth.current }, '')
    setStep(next)
  }, [])

  const goBack = useCallback(() => window.history.back(), [])

  return { step, canGoBack, goTo, replaceWith, goBack }
}
