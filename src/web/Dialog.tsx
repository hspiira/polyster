/* The web's ui/Sheet: a separate component, not a prop (W4). Escape closes,
   focus moves in and returns, and the page behind does not scroll. */
import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { cn } from '../lib/cn'
import { RADIUS, TEXT_SM } from './chrome'

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ComponentChildren
}) {
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)

  /* Behind a ref so the effect depends on `open` alone: an inline onClose is a
     new function each render, which left the page unscrollable and lost focus. */
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return

    opener.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)

    // The first field, not the panel: a payment dialog that opens with the
    // cursor already in the amount saves the one interaction it exists for.
    const focusable = panel.current?.querySelector<HTMLElement>(
      'input, select, textarea, button',
    )
    focusable?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      // Only if still in the document: a row that re-rendered away cannot take
      // focus, and asking it silently drops focus to <body>.
      if (opener.current instanceof HTMLElement && opener.current.isConnected) {
        opener.current.focus()
      }
    }
  }, [open])

  if (!open) return null

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        class="absolute inset-0 bg-scrim"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        class={cn(
          'relative w-full max-w-[24rem] bg-surface p-4 shadow-overlay',
          RADIUS,
        )}
      >
        <h2 class="text-[15px] font-semibold tracking-tight">{title}</h2>
        {description && (
          <p class={cn('mt-0.5 text-content-muted', TEXT_SM)}>{description}</p>
        )}
        <div class="mt-3.5">{children}</div>
      </div>
    </div>
  )
}
