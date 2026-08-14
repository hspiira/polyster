import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { IconChevronRight } from '../components/icons'
import { cn } from '../lib/cn'

/* An optional group of fields, closed until asked for. `forceOpen` stops a
   validation error hiding from the person trying to fix it. */
export function Disclosure({
  label,
  summary,
  defaultOpen = false,
  forceOpen = false,
  children,
}: {
  label: string
  /** What is inside, when closed. */
  summary?: string
  defaultOpen?: boolean
  forceOpen?: boolean
  children: ComponentChildren
}) {
  const [open, setOpen] = useState(defaultOpen || forceOpen)

  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  return (
    <div class="border-t border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        class="flex min-h-tap w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span class="text-[15px] font-medium">{label}</span>
        <span class="flex min-w-0 items-center gap-1.5 text-[13px] text-content-muted">
          {!open && summary && <span class="truncate">{summary}</span>}
          <IconChevronRight
            size={16}
            class={cn('shrink-0 transition-transform', open && 'rotate-90')}
          />
        </span>
      </button>
      {open && <div class="space-y-4 pt-1 pb-3">{children}</div>}
    </div>
  )
}
