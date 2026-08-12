/**
 * Surfaces: the things content sits on.
 *
 * A surface is separated from the page by its fill, never by a border. If one
 * of these needs a hairline to read, the spacing around it is wrong.
 */
import type { ComponentChildren } from 'preact'
import { useEffect } from 'preact/hooks'
import { cn } from '../lib/cn'

/** Edge to edge on a phone, inset card from `sm`. Cancels the page gutter so
 *  rows pad once, not twice. */
export const FLUSH_SURFACE =
  '-mx-gutter overflow-hidden bg-surface sm:mx-0 sm:rounded-card sm:shadow-raise'

export function Card({
  children,
  class: className,
  padded = true,
}: {
  children: ComponentChildren
  class?: string
  padded?: boolean
}) {
  return (
    <div class={cn('rounded-card bg-surface shadow-raise', padded && 'p-gutter', className)}>
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

/**
 * A form that interrupts a screen rather than belonging to it.
 *
 * Bottom sheet on a phone, centred dialog above `sm`: the bottom edge exists
 * because that is where the thumb is, which stops being true with a mouse.
 */
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
  // Escape closes, and the page behind must not scroll while it is open.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

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
        class="relative max-h-[88svh] w-full animate-sheet-in overflow-y-auto rounded-t-panel
               bg-surface-raised shadow-overlay safe-bottom
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
