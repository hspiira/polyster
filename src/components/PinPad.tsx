/**
 * The six-digit PIN pad, shared by every place a PIN is typed.
 *
 * One component for entry, for choosing a new PIN, and for confirming it, so
 * those three never drift apart. Nobody should meet a number pad on one screen
 * and a text field on the next.
 *
 * Behaviour, all of it deliberate:
 *
 *  - **It submits itself on the sixth digit.** PINs are a fixed length
 *    (lib/pin.ts), so the pad always knows when you have finished. No confirm
 *    tap.
 *  - **Delete only exists once there is something to delete.** A permanent
 *    backspace on an empty pad is a key that does nothing.
 *  - **Failure shakes the dots and clears them.** Faster to read than an error
 *    you have to dismiss before retyping.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { IconBackspace } from './icons'
import { PIN_LENGTH } from '../lib/pin'

export interface PinPadProps {
  /**
   * Called with the completed PIN. Resolve false to reject it -- the pad
   * shakes, clears, and stays put.
   */
  onComplete(pin: string): Promise<boolean> | boolean
  /** Shown under the title in the resting state. */
  hint?: string
  /** Shown in place of the hint after `onComplete` rejects. */
  errorHint?: string
  busyHint?: string
}

export function PinPad({
  onComplete,
  hint = 'Enter your PIN',
  errorHint = 'Wrong PIN, try again',
  busyHint = 'Checking...',
}: PinPadProps) {
  const [pin, setPin] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  // Guards a second submission while the first is still running: PBKDF2 takes
  // a moment, and a fast double-tap on the last digit would start two.
  const running = useRef(false)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  async function submit(candidate: string) {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      const ok = await onComplete(candidate)
      if (!ok && mounted.current) {
        setFailed(true)
        setPin('')
        window.setTimeout(() => mounted.current && setFailed(false), 600)
      }
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }

  function press(key: string) {
    if (busy) return
    setFailed(false)

    if (key === 'del') {
      setPin((current) => current.slice(0, -1))
      return
    }

    setPin((current) => {
      if (current.length >= PIN_LENGTH) return current
      const next = current + key
      if (next.length === PIN_LENGTH) void submit(next)
      return next
    })
  }

  return (
    <div class="space-y-7">
      <p
        class={`text-center text-sm ${
          failed ? 'text-red-600 dark:text-red-400' : 'text-stone-500 dark:text-stone-400'
        }`}
        role={failed ? 'alert' : undefined}
      >
        {failed ? errorHint : busy ? busyHint : hint}
      </p>

      <div
        class={`flex justify-center gap-3 ${failed ? 'animate-shake' : ''}`}
        aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span
            key={index}
            class={`size-3.5 rounded-full transition-all duration-150 ${
              failed
                ? 'bg-red-500'
                : index < pin.length
                  ? 'scale-110 bg-brand-700 dark:bg-brand-400'
                  : 'bg-stone-300 dark:bg-stone-700'
            }`}
          />
        ))}
      </div>

      <div class="grid grid-cols-3 justify-items-center gap-x-5 gap-y-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
          <PadKey key={key} label={key} disabled={busy} onPress={() => press(key)} />
        ))}

        {/* Empty cell keeps 0 centred without the delete key having to exist. */}
        <span />
        <PadKey label="0" disabled={busy} onPress={() => press('0')} />
        {pin.length > 0 ? (
          <PadKey
            label="Delete"
            ghost
            disabled={busy}
            onPress={() => press('del')}
            icon={<IconBackspace size={24} />}
          />
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}

function PadKey({
  label,
  icon,
  ghost = false,
  disabled,
  onPress,
}: {
  label: string
  icon?: ComponentChildren
  ghost?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      class={`flex size-[4.5rem] items-center justify-center rounded-full text-2xl font-normal
              transition-transform duration-75 active:scale-90 disabled:opacity-40 ${
                ghost
                  ? 'text-stone-500 active:bg-stone-200 dark:text-stone-400 dark:active:bg-stone-800'
                  : `border border-stone-200/80 bg-white shadow-card active:bg-stone-100
                     dark:border-stone-800 dark:bg-stone-900 dark:active:bg-stone-800`
              }`}
    >
      {icon ?? label}
    </button>
  )
}
