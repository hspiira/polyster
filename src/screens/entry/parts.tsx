/**
 * Dark-only primitives for the entry flow.
 *
 * Unthemed on purpose (spec E6): everything before the shell is one fixed,
 * branded world, so the first run does not flicker between light and dark.
 */
import type { ComponentChildren, JSX } from 'preact'
import { cn } from '../../lib/cn'
import { GlowBackdrop } from '../../components/GlowBackdrop'

/** Full-screen dark shell with the drifting glow. */
export function EntryScreen({ children }: { children: ComponentChildren }) {
  return (
    <main class="relative flex min-h-svh flex-col overflow-hidden bg-stone-950 px-6 text-stone-100">
      <GlowBackdrop />
      <div class="safe-top safe-bottom relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col">
        {children}
      </div>
    </main>
  )
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
    <header class={cn('mb-6', centred && 'text-center')}>
      <h1 class="text-2xl font-semibold tracking-tight text-white">{title}</h1>
      {body && <p class="mt-1.5 text-sm leading-relaxed text-stone-400">{body}</p>}
    </header>
  )
}

export function EntryField({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="mb-3 block">
      <span class="mb-1.5 block pl-4 text-sm font-medium text-stone-300">{label}</span>
      {children}
    </label>
  )
}

export function EntryInput({ class: className, ...props }: JSX.IntrinsicElements['input']) {
  return (
    <input
      {...props}
      class={cn(
        'min-h-11 w-full rounded-control border border-white/12 bg-white/6 px-4.5',
        'text-base text-white outline-none transition-colors placeholder:text-stone-500',
        'focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25',
        className,
      )}
    />
  )
}

export function EntryButton({ class: className, ...props }: JSX.IntrinsicElements['button']) {
  return (
    <button
      {...props}
      class={cn(
        'min-h-12 w-full rounded-control bg-brand-500 px-4 text-[15px] font-semibold text-white',
        'transition-transform active:scale-[0.98] active:bg-brand-600',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
    />
  )
}

/** Destructive variant, for the one path that removes local data. */
export function EntryDangerButton({ class: className, ...props }: JSX.IntrinsicElements['button']) {
  return (
    <button
      {...props}
      class={cn(
        'min-h-12 w-full rounded-control border border-red-500/40 bg-red-500/12 px-4',
        'text-[15px] font-semibold text-red-300 transition-transform active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-40',
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
        className,
      )}
    />
  )
}

export function EntryError({ children }: { children: ComponentChildren }) {
  return (
    <p
      role="alert"
      class="mt-3 rounded-control border border-red-500/30 bg-red-500/12 px-4 py-2.5 text-sm text-red-300"
    >
      {children}
    </p>
  )
}

export function EntryNote({ children }: { children: ComponentChildren }) {
  return (
    <p class="rounded-card border border-white/11 bg-white/5 px-4 py-3.5 text-sm leading-relaxed text-stone-300">
      {children}
    </p>
  )
}
