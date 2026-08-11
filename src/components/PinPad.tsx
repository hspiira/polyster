/**
 * The six-digit pad, used everywhere a PIN or a one-time code is typed.
 *
 * It submits itself on the sixth digit, since PINs are a fixed length. Delete
 * only appears once there is something to delete. A wrong entry shakes the dots
 * and clears them, which is quicker to read than an error you must dismiss.
 *
 * Three ways in, all writing to the same value: the on-screen keys, a physical
 * keyboard, and a hidden input that carries `autocomplete` so the phone can fill
 * an SMS code and so the code can be pasted.
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
  /**
   * Turns the hidden field into a one-time-code field, so a phone can offer the
   * SMS code it just received. Leave off for PINs, which no autofill knows.
   */
  oneTimeCode?: boolean
  /** Names the hidden field for screen readers and password managers. */
  label?: string
}

export function PinPad({
  onComplete,
  hint = 'Enter your PIN',
  errorHint = 'Wrong PIN, try again',
  busyHint = 'Checking...',
  tone = 'dark',
  oneTimeCode = false,
  label = 'PIN',
}: PinPadProps) {
  const [pin, setPin] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  // Guards a second submission while the first is still running: PBKDF2 takes
  // a moment, and a fast double-tap on the last digit would start two.
  const running = useRef(false)
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  // Synchronous, so two taps in one frame cannot both read a stale value.
  const entered = useRef('')

  function write(next: string) {
    entered.current = next
    setPin(next)
  }

  async function submit(candidate: string) {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      const ok = await onComplete(candidate)
      if (!ok && mounted.current) {
        setFailed(true)
        write('')
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
      write(entered.current.slice(0, -1))
      return
    }

    if (entered.current.length >= PIN_LENGTH) return
    const next = entered.current + key
    write(next)
    // Out of the state updater: a side effect there can run more than once.
    if (next.length === PIN_LENGTH) void submit(next)
  }

  /** Autofill and paste arrive whole, so take the value rather than a keystroke. */
  function fill(raw: string) {
    if (busy) return
    const digits = raw.replace(/\D/g, '').slice(0, PIN_LENGTH)
    setFailed(false)
    write(digits)
    if (digits.length === PIN_LENGTH) void submit(digits)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      // The hidden field handles its own typing; taking it here too double-enters.
      if (event.target === field.current) return
      if (/^\d$/.test(event.key)) {
        event.preventDefault()
        press(event.key)
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        press('del')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const dark = tone === 'dark'

  return (
    <div class="relative space-y-7">
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

      {/* Off-screen but focusable, so autofill has somewhere to put an SMS code
          and a paste has somewhere to land. The dots stay the visible control. */}
      <input
        ref={field}
        type="text"
        inputMode="numeric"
        autocomplete={oneTimeCode ? 'one-time-code' : 'off'}
        aria-label={label}
        maxLength={PIN_LENGTH}
        value={pin}
        disabled={busy}
        onInput={(event) => fill((event.target as HTMLInputElement).value)}
        class="absolute size-px overflow-hidden opacity-0"
      />

      {/* Tapping the dots focuses the hidden field, which is how you reach paste
          and autofill without the keyboard opening on top of the pad. */}
      <div
        class={`flex cursor-text justify-center gap-3 ${failed ? 'animate-shake' : ''}`}
        onClick={() => field.current?.focus()}
        role="status"
        aria-live="polite"
        aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => {
          const filled = index < pin.length
          const glow = dark && filled && !failed
          return (
            <span
              key={index}
              class={`size-3.5 rounded-full transition-[transform,background-color] duration-150 ${
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
      // On press, not release: a click needs the touch to stay inside the
      // browser's slop, and fast typing rolls the finger past it.
      onPointerDown={(event) => {
        if (event.button === 0) onPress()
      }}
      // detail 0 means keyboard, the one case pointerdown never sees.
      onClick={(event) => {
        if (event.detail === 0) onPress()
      }}
      class={cn(
        'flex size-18 select-none items-center justify-center overflow-hidden rounded-full',
        'transition-transform duration-75 active:scale-90 disabled:opacity-40',
        // "Delete" is a word, so it cannot carry the digits' type size.
        ghost ? 'text-sm font-medium' : 'text-2xl font-normal',
        ghost
          ? dark
            ? 'text-stone-300 active:bg-white/10'
            : 'text-stone-500 active:bg-stone-200 dark:text-stone-400 dark:active:bg-stone-800'
          : dark
            ? // No sheen: eighteen keys each catching a highlight reads as noise, not material.
              'glass-flat text-stone-100'
            : `bg-stone-200 active:bg-stone-300
               dark:bg-stone-800 dark:active:bg-stone-700`,
      )}
    >
      {label}
    </button>
  )
}
