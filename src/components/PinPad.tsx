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
 *
 * `tone="dark"` is for StaffGate's fixed-dark screen; SetupFlow stays on the default `"light"`.
 */
import { useEffect, useRef, useState } from 'preact/hooks'
import { cn } from '../lib/cn'
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
  /** @default "light" */
  tone?: 'light' | 'dark'
}

export function PinPad({
  onComplete,
  hint = 'Enter your PIN',
  errorHint = 'Wrong PIN, try again',
  busyHint = 'Checking...',
  tone = 'dark',
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

  const dark = tone === 'dark'

  return (
    <div class="space-y-7">
      <p
        class={`text-center text-sm ${
          failed
            ? dark
              ? 'text-red-400'
              : 'text-red-600 dark:text-red-400'
            : dark
              ? 'text-stone-300'
              : 'text-stone-500 dark:text-stone-400'
        }`}
        role={failed ? 'alert' : undefined}
      >
        {failed ? errorHint : busy ? busyHint : hint}
      </p>

      <div
        class={`flex justify-center gap-3 ${failed ? 'animate-shake' : ''}`}
        aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => {
          const filled = index < pin.length
          const glow = dark && filled && !failed
          return (
            <span
              key={index}
              class={`size-3.5 rounded-full transition-all duration-150 ${
                failed
                  ? 'bg-red-500'
                  : filled
                    ? dark
                      ? 'scale-110 bg-brand-400'
                      : 'scale-110 bg-brand-700 dark:bg-brand-400'
                    : dark
                      ? 'bg-white/20'
                      : 'bg-stone-300 dark:bg-stone-700'
              }`}
              style={
                glow
                  ? { boxShadow: '0 0 8px color-mix(in oklch, var(--color-brand-400) 70%, transparent)' }
                  : undefined
              }
            />
          )
        })}
      </div>

      <div class="grid grid-cols-3 justify-items-center gap-x-5 gap-y-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
          <PadKey key={key} label={key} tone={tone} disabled={busy} onPress={() => press(key)} />
        ))}

        {/* Empty cell keeps 0 centred without the delete key having to exist. */}
        <span />
        <PadKey label="0" tone={tone} disabled={busy} onPress={() => press('0')} />
        {pin.length > 0 ? (
          <PadKey label="Delete" ghost tone={tone} disabled={busy} onPress={() => press('del')} />
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}

function PadKey({
  label,
  ghost = false,
  tone = 'dark',
  disabled,
  onPress,
}: {
  label: string
  ghost?: boolean
  tone?: 'light' | 'dark'
  disabled?: boolean
  onPress: () => void
}) {
  const dark = tone === 'dark'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      class={cn(
        'flex size-18 items-center justify-center overflow-hidden rounded-full',
        'transition-transform duration-75 active:scale-90 disabled:opacity-40',
        // "Delete" is a word, so it cannot carry the digits' type size.
        ghost ? 'text-sm font-medium' : 'text-2xl font-normal',
        ghost
          ? dark
            ? 'text-stone-300 active:bg-white/10'
            : 'text-stone-500 active:bg-stone-200 dark:text-stone-400 dark:active:bg-stone-800'
          : dark
            ? 'glass glass-sheen text-stone-100'
            : `border border-stone-200/80 bg-white shadow-card active:bg-stone-100
               dark:border-stone-800 dark:bg-stone-900 dark:active:bg-stone-800`,
      )}
    >
      {label}
    </button>
  )
}
