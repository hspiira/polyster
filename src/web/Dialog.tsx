/**
 * A centred modal.
 *
 * The web design's equivalent of ui/Sheet, and a separate component rather than
 * a prop on it (spec W4). A sheet slides from the bottom edge because a thumb
 * is at the bottom edge; on a desk that idiom reads as a phone app, and the
 * dialog belongs where the eye already is.
 *
 * Escape closes, focus moves in on open and returns to whatever opened it, and
 * the page behind does not scroll. None of that is optional for a modal a
 * keyboard user can reach.
 */
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

  /**
   * The close callback behind a ref, so the effect below depends on `open`
   * alone.
   *
   * Depending on `onClose` looks harmless and is not: callers write
   * `onClose={() => setPaying(false)}`, a new function every render, so the
   * effect tore down and re-ran on each one. Two things broke. The
   * "previous overflow" snapshot eventually captured its own `hidden` and
   * restored that on close, leaving the page permanently unscrollable; and
   * `opener` was overwritten mid-open, so focus never came back. Both were
   * caught by driving the dialog, not by reading it.
   */
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
      // Only if it is still in the document: a row that re-rendered away while
      // the dialog was open cannot take focus, and asking it to silently drops
      // focus to <body> instead.
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
