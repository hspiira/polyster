/* Escape, scroll lock, focus in and focus back: what every modal owes, in one
   place. Was only in web/Dialog, so the phone's Sheet did neither focus half. */
import { useEffect, useRef } from 'preact/hooks'

/** `initialFocus` differs by shell on purpose; see the branch that reads it. */
export function useModalChrome(
  open: boolean,
  onClose: () => void,
  initialFocus: 'panel' | 'field' = 'panel',
) {
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

    if (initialFocus === 'field') {
      // Desktop: a payment dialog opening with the cursor already in the amount
      // saves the one interaction it exists for.
      panel.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    } else {
      // Phone: focusing a control opens the soft keyboard over the sheet, and a
      // PIN pad in particular is built to be used without it.
      panel.current?.focus()
    }

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      // Only if still in the document: a row that re-rendered away cannot take
      // focus, and asking it silently drops focus to <body>.
      if (opener.current instanceof HTMLElement && opener.current.isConnected) {
        opener.current.focus()
      }
    }
  }, [open, initialFocus])

  return panel
}
