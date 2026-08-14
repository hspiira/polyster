/* Choose a PIN, then type it again. The two-phase dance and its mismatch reset
   were written out at every place a PIN is set. */
import { useState } from 'preact/hooks'
import { PinPad } from './PinPad'
import { PIN_LENGTH } from '../lib/pin'

export function ChoosePinPad({
  tone = 'light',
  chooseHint = `Choose ${PIN_LENGTH} digits`,
  confirmHint = 'Type it again to confirm',
  /** Resolves to an error message, or null when the PIN was saved. */
  onChosen,
  onError,
  onPhase,
}: {
  tone?: 'light' | 'dark'
  chooseHint?: string
  confirmHint?: string
  onChosen: (pin: string) => Promise<string | null>
  onError: (message: string | null) => void
  /** For screens whose own heading tracks the phase. */
  onPhase?: (confirming: boolean) => void
}) {
  const [phase, setPhase] = useState<'choose' | 'confirm'>('choose')
  const [first, setFirst] = useState('')

  const confirming = phase === 'confirm'

  function go(next: 'choose' | 'confirm') {
    setPhase(next)
    onPhase?.(next === 'confirm')
  }

  function restart(message: string) {
    setFirst('')
    go('choose')
    onError(message)
  }

  return (
    <PinPad
      key={phase}
      tone={tone}
      hint={confirming ? confirmHint : chooseHint}
      errorHint="Those did not match. Start again."
      busyHint="Saving..."
      onComplete={async (pin) => {
        if (!confirming) {
          setFirst(pin)
          go('confirm')
          onError(null)
          return true
        }

        if (pin !== first) {
          restart('Those two PINs did not match. Choose one again.')
          return false
        }

        const failure = await onChosen(pin)
        if (failure) {
          restart(failure)
          return false
        }
        return true
      }}
    />
  )
}
