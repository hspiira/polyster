/**
 * Dark-only building blocks for the entry flow.
 *
 * Always dark, whatever the system theme (spec E6), so the first run does not
 * flash between light and dark. Two layouts only: forms, and centred pads.
 */
import { cloneElement } from 'preact'
import { useId } from 'preact/hooks'
import type { ComponentChildren, JSX, RefObject, VNode } from 'preact'
import { cn } from '../../lib/cn'
import { GlowBackdrop } from '../../components/GlowBackdrop'

/**
 * Full-screen dark shell with the drifting glow.
 *
 * Nested on purpose: `safe-top` and `safe-bottom` set their own padding, so a
 * `pt-*` on the same element is silently overridden. Outer holds the safe area,
 * inner holds the spacing.
 */
export function EntryScreen({ children }: { children: ComponentChildren }) {
  return (
    <main class="relative flex min-h-svh flex-col overflow-hidden bg-stone-950 px-6 text-stone-100">
      <GlowBackdrop />
      <div class="safe-top safe-bottom relative z-10 flex flex-1 flex-col">
        <div class="mx-auto flex w-full max-w-sm flex-1 flex-col pb-10 pt-10">{children}</div>
      </div>
    </main>
  )
}

/**
 * Heading, fields, then the action right beneath them.
 *
 * The action is not on the bottom edge: on a short form that leaves a big gap
 * between what you typed and the button, which reads as a bug. Secondary things
 * go in `footer`, which is pinned.
 */
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
      <h1 class="text-[26px] font-semibold leading-tight tracking-tight text-white">{title}</h1>
      {body && <p class="mt-2 text-sm leading-relaxed text-stone-400">{body}</p>}
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
      <span class="mb-2 block pl-4 text-sm font-medium text-stone-300">{label}</span>
      {cloneElement(children, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {error ? (
        <span id={errorId} role="alert" class="mt-2 block pl-4 text-sm leading-relaxed text-red-400">
          {error}
        </span>
      ) : (
        hint && (
          <span id={hintId} class="mt-2 block pl-4 text-sm leading-relaxed text-stone-400">
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
  ...props
}: JSX.IntrinsicElements['input'] & { inputRef?: RefObject<HTMLInputElement> }) {
  return (
    <span
      class={cn(
        'glass-inset glass-sheen block overflow-hidden rounded-control',
        'transition-colors focus-within:border-white/32',
        props['aria-invalid'] && 'border-red-500/60',
        className,
      )}
    >
      <input
        {...props}
        ref={inputRef}
        class="relative z-10 min-h-13 w-full bg-transparent px-5 text-base text-white
               outline-none placeholder:text-stone-400"
      />
    </span>
  )
}

/** Glass, matching the landing pill, so every screen speaks one material. */
export function EntryButton({ class: className, ...props }: JSX.IntrinsicElements['button']) {
  return (
    <button
      {...props}
      class={cn(
        'glass glass-sheen min-h-13 w-full overflow-hidden rounded-control px-4',
        'text-[15px] font-semibold text-white transition-transform active:scale-[0.98]',
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
        'min-h-13 w-full rounded-control border border-red-500/40 bg-red-500/12 px-4',
        'text-[15px] font-semibold text-red-300 backdrop-blur-xl transition-transform',
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
        'min-h-11 w-full text-sm font-medium text-stone-400 active:text-stone-200',
        'disabled:pointer-events-none disabled:text-stone-500',
        className,
      )}
    />
  )
}

/** Just words. A boxed alert on a dark screen shouts louder than the problem is. */
export function EntryError({ children }: { children: ComponentChildren }) {
  return (
    <p role="alert" class="mb-5 text-sm leading-relaxed text-red-400">
      {children}
    </p>
  )
}

/** rounded-xl, not rounded-card: --radius-card is near-square for the shell. */
export function EntryNote({ children }: { children: ComponentChildren }) {
  return (
    <p class="glass rounded-xl px-4 py-3.5 text-sm leading-relaxed text-stone-300">{children}</p>
  )
}
