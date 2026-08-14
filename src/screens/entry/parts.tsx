/* Building blocks for the entry flow. Always dark, whatever the system theme
   (spec E6), so the first run does not flash between light and dark. */
import { cloneElement } from 'preact'
import { useId } from 'preact/hooks'
import type { ComponentChildren, JSX, RefObject, VNode } from 'preact'
import { cn } from '../../lib/cn'
import { GlowBackdrop } from '../../components/GlowBackdrop'

/* `data-theme` pins the subtree dark, which is what lets everything inside ask
   for a role instead of naming a colour. Nesting is for the safe-area padding. */
export function EntryScreen({ children }: { children: ComponentChildren }) {
  return (
    <main
      data-theme="dark"
      class="relative flex min-h-svh flex-col overflow-hidden bg-page px-6 text-content"
    >
      <GlowBackdrop />
      <div class="safe-top safe-bottom relative z-10 flex flex-1 flex-col">
        <div class="mx-auto flex w-full max-w-sm flex-1 flex-col pb-10 pt-10">{children}</div>
      </div>
    </main>
  )
}

/* The action sits under the fields, not on the bottom edge -- on a short form
   that gap between what you typed and the button reads as a bug. */
export function EntryForm({
  onSubmit,
  children,
  actions,
  footer,
}: {
  onSubmit?: (event: Event) => void
  children: ComponentChildren
  actions?: ComponentChildren
  footer?: ComponentChildren
}) {
  return (
    <form onSubmit={onSubmit} class="flex flex-1 flex-col">
      <div class="flex flex-1 flex-col justify-center pb-4">
        {children}
        {actions && <div class="mt-9 space-y-2">{actions}</div>}
      </div>
      {footer && <div>{footer}</div>}
    </form>
  )
}

/** For the pads, where the content is the thing being centred. */
export function EntryCentred({ children }: { children: ComponentChildren }) {
  return <div class="flex flex-1 flex-col justify-center pb-8">{children}</div>
}

export function EntryHeading({
  title,
  body,
  centred = false,
}: {
  title: string
  body?: string
  centred?: boolean
}) {
  return (
    <header class={cn('mb-7', centred && 'text-center')}>
      <h1 class="text-[26px] font-semibold leading-tight tracking-tight text-content">{title}</h1>
      {body && <p class="mt-2 text-sm leading-relaxed text-content-muted">{body}</p>}
    </header>
  )
}

/** The control is cloned so the error is named on the input, not just near it. */
export function EntryField({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  children: VNode<JSX.IntrinsicElements['input']>
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ')

  return (
    <label class="mb-4 block">
      <span class="mb-2 block pl-4 text-sm font-medium text-content-muted">{label}</span>
      {cloneElement(children, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {error ? (
        <span id={errorId} role="alert" class="mt-2 block pl-4 text-sm leading-relaxed text-danger">
          {error}
        </span>
      ) : (
        hint && (
          <span id={hintId} class="mt-2 block pl-4 text-sm leading-relaxed text-content-muted">

            {hint}
          </span>
        )
      )}
    </label>
  )
}

/** Glass sits on a wrapper, not the input: `::before` does not render on an input. */
export function EntryInput({
  class: className,
  inputRef,
  trailing,
  onValue,
  onInput,
  ...props
}: JSX.IntrinsicElements['input'] & {
  inputRef?: RefObject<HTMLInputElement>
  trailing?: ComponentChildren
  onValue?: (value: string) => void
}) {
  const handleInput = onValue
    ? (event: JSX.TargetedInputEvent<HTMLInputElement>) => {
        onValue((event.target as HTMLInputElement).value)
        onInput?.(event)
      }
    : onInput
  return (
    <span
      class={cn(
        'glass-inset glass-sheen block overflow-hidden rounded-control',
        'transition-colors focus-within:border-glass-edge',
        props['aria-invalid'] && 'border-danger/60',
        className,
      )}
    >
      <input
        {...props}
        onInput={handleInput}
        ref={inputRef}
        class={cn(
          'relative z-10 min-h-13 w-full bg-transparent pl-5 text-base text-content',
          'outline-none placeholder:text-content-muted',
          trailing ? 'pr-13' : 'pr-5',
        )}
      />
      {trailing && (
        <span class="absolute inset-y-0 right-1 z-10 flex items-center">{trailing}</span>
      )}
    </span>
  )
}

export function EntryReveal({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      class="flex min-h-11 items-center rounded-control px-3 text-xs font-semibold
             text-content-muted active:text-content"
    >
      {shown ? 'Hide' : 'Show'}
    </button>
  )
}

export function EntryDivider({ children }: { children: ComponentChildren }) {
  return (
    <div class="my-6 flex items-center gap-3" role="separator">
      <span class="h-px flex-1 bg-glass-rule" />
      <span class="text-xs font-medium text-content-subtle">{children}</span>
      <span class="h-px flex-1 bg-glass-rule" />
    </div>
  )
}

/** Glass, matching the landing pill, so every screen speaks one material. */
export function EntryButton({ class: className, ...props }: JSX.IntrinsicElements['button']) {
  return (
    <button
      {...props}
      class={cn(
        'glass glass-sheen min-h-13 w-full overflow-hidden rounded-control px-4',
        'text-[15px] font-semibold text-content transition-transform active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
    />
  )
}

/** Destructive, for the one path that removes local data. */
export function EntryDangerButton({ class: className, ...props }: JSX.IntrinsicElements['button']) {
  return (
    <button
      {...props}
      class={cn(
        'min-h-13 w-full rounded-control border border-danger/40 bg-danger/12 px-4',
        'text-[15px] font-semibold text-danger-on-soft backdrop-blur-xl transition-transform',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
    />
  )
}

export function EntryQuietButton({ class: className, ...props }: JSX.IntrinsicElements['button']) {
  return (
    <button
      {...props}
      class={cn(
        'min-h-11 w-full text-sm font-medium text-content-muted active:text-content',
        'disabled:pointer-events-none disabled:text-content-subtle',
        className,
      )}
    />
  )
}

/** Just words. A boxed alert on a dark screen shouts louder than the problem is. */
export function EntryError({ children }: { children: ComponentChildren }) {
  return (
    <p role="alert" class="mb-5 text-sm leading-relaxed text-danger">
      {children}
    </p>
  )
}

/** rounded-xl, not rounded-card: --radius-card is near-square for the shell. */
export function EntryNote({ children }: { children: ComponentChildren }) {
  return (
    <p class="glass rounded-xl px-4 py-3.5 text-sm leading-relaxed text-content-muted">
      {children}
    </p>
  )
}
