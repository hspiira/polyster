/**
 * Dark-only primitives for the entry flow.
 *
 * Unthemed on purpose (spec E6): everything before the shell is one fixed,
 * branded world, so the first run does not flicker between light and dark.
 * That fixed dark is also what lets the glass in index.css read as material
 * rather than as decoration.
 *
 * Two layouts, and only two. Forms anchor their content under the header and
 * pin their actions to the bottom edge, the way a phone form should. Pads
 * centre, because the pad is the content.
 */
import type { ComponentChildren, JSX } from 'preact'
import { cn } from '../../lib/cn'
import { GlowBackdrop } from '../../components/GlowBackdrop'

/**
 * Full-screen dark shell with the drifting glow.
 *
 * Two nested wrappers, and the nesting is load-bearing: `safe-top` and
 * `safe-bottom` set padding themselves, so a `pt-*` on the same element is
 * silently overridden. The outer holds the safe area, the inner the design
 * spacing.
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
 * A form as one block: heading, fields, then its action directly beneath.
 *
 * The action deliberately does not sit against the bottom edge. On a two-field
 * step that leaves several hundred pixels of nothing between what you typed
 * and the button that submits it, which reads as a mistake rather than as
 * space. Anything genuinely secondary goes in `footer`, which is pinned.
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

export function EntryField({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="mb-4 block">
      <span class="mb-2 block pl-4 text-sm font-medium text-stone-300">{label}</span>
      {children}
    </label>
  )
}

/**
 * The glass lives on a wrapper, not the input: `::before` does not render on
 * a replaced element, so the sheen has nowhere to go otherwise.
 *
 * Focus brightens the rim rather than adding a coloured ring. Still clearly
 * visible for keyboard use -- a contrast change, not a removed indicator.
 */
export function EntryInput({ class: className, ...props }: JSX.IntrinsicElements['input']) {
  return (
    <span
      class={cn(
        'glass-inset glass-sheen block overflow-hidden rounded-control',
        'transition-colors focus-within:border-white/32',
        className,
      )}
    >
      <input
        {...props}
        class="relative z-10 min-h-13 w-full bg-transparent px-5 text-base text-white
               outline-none placeholder:text-stone-500"
      />
    </span>
  )
}

/** The one solid, saturated thing on the screen. Everything else is glass or black. */
export function EntryButton({ class: className, ...props }: JSX.IntrinsicElements['button']) {
  return (
    <button
      {...props}
      class={cn(
        'min-h-13 w-full rounded-control bg-brand-500 px-4 text-[15px] font-semibold',
        'text-white transition-transform active:scale-[0.98] active:bg-brand-600',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
    />
  )
}

/** Secondary action that still needs to look like a control. */
export function EntryGlassButton({ class: className, ...props }: JSX.IntrinsicElements['button']) {
  return (
    <button
      {...props}
      class={cn(
        'glass glass-sheen min-h-13 w-full overflow-hidden rounded-control px-4',
        'text-[15px] font-medium text-white transition-transform active:scale-[0.98]',
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

export function EntryNote({ children }: { children: ComponentChildren }) {
  return (
    <p class="glass rounded-card px-4 py-3.5 text-sm leading-relaxed text-stone-300">{children}</p>
  )
}
