/* The things content sits on. A surface is separated by its fill, never a
   border -- if one needs a hairline to read, the spacing is wrong. */
import type { ComponentChildren } from 'preact'
import { cn } from '../lib/cn'
import { useModalChrome } from '../hooks/useModalChrome'

/** Edge to edge on a phone, inset card from `sm`. Cancels the page gutter so
 *  rows pad once, not twice. */
export const FLUSH_SURFACE =
  '-mx-gutter overflow-hidden bg-surface sm:mx-0 sm:rounded-card sm:shadow-raise'

/* Same shape on --surface-flat: a step above the page, not the full jump. For
   row-heavy screens, where full cards read as cut-out tiles. */
export const FLUSH_SURFACE_FLAT =
  '-mx-gutter overflow-hidden bg-surface-flat sm:mx-0 sm:rounded-card sm:shadow-raise'

export function Card({
  children,
  class: className,
  padded = true,
  flush = false,
  flat = false,
}: {
  children: ComponentChildren
  class?: string
  padded?: boolean
  /** Edge to edge on a phone. See FLUSH_SURFACE. */
  flush?: boolean
  /** See FLUSH_SURFACE_FLAT. */
  flat?: boolean
}) {
  return (
    <div
      class={cn(
        flush
          ? flat
            ? FLUSH_SURFACE_FLAT
            : FLUSH_SURFACE
          : cn('rounded-card shadow-raise', flat ? 'bg-surface-flat' : 'bg-surface'),
        padded && 'p-gutter',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SectionTitle({
  children,
  action,
}: {
  children: ComponentChildren
  action?: ComponentChildren
}) {
  return (
    <div class="mb-2 flex items-baseline justify-between gap-3 px-1">
      <h2 class="text-xs font-semibold tracking-wide text-content-muted">{children}</h2>
      {action}
    </div>
  )
}

/** A titled card with an optional count, subtitle and footer link. */
export function SectionCard({
  title,
  count,
  subtitle,
  footer,
  children,
}: {
  title: string
  count?: number
  subtitle?: string
  footer?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <section class="overflow-hidden rounded-card bg-surface shadow-raise">
      <div class="px-gutter pt-4 pb-1">
        <h2 class="flex items-baseline gap-1.5 text-heading font-semibold">
          {title}
          {count !== undefined && (
            <span class="text-xs font-normal text-content-muted">{count}</span>
          )}
        </h2>
        {subtitle && <p class="mt-0.5 text-xs text-content-muted">{subtitle}</p>}
      </div>
      {children}
      {footer}
    </section>
  )
}

/* A form that interrupts a screen. Bottom sheet on a phone, centred dialog
   above sm: the bottom edge is where the thumb is, but not the mouse. */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ComponentChildren
}) {
  // Escape, scroll lock, and focus in and back. 'panel' rather than the first
  // field: on a phone that would open the keyboard over the sheet.
  const panel = useModalChrome(open, onClose)

  if (!open) return null

  return (
    <div
      class="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        class="absolute inset-0 animate-fade-in bg-scrim backdrop-blur-[2px]"
      />
      <div
        ref={panel}
        tabIndex={-1}
        class="relative max-h-[88svh] w-full animate-sheet-in overflow-y-auto rounded-t-panel
               bg-surface-raised shadow-overlay outline-none safe-bottom
               sm:max-w-lg sm:rounded-panel sm:pb-0"
      >
        {/* A signal that this is dismissable. Dragging is not implemented. */}
        <div class="sticky top-0 z-10 flex flex-col items-center bg-inherit pt-2.5">
          <span class="h-1 w-9 rounded-full bg-line-strong sm:hidden" />
          <h2 class="w-full px-5 pt-3 pb-2 text-heading font-semibold">{title}</h2>
        </div>
        <div class="px-5 pt-1 pb-5">{children}</div>
      </div>
    </div>
  )
}
