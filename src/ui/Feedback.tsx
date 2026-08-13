/* What a screen shows when it has nothing, is loading, or has gone wrong. */
import type { ComponentChildren } from 'preact'
import { cn } from '../lib/cn'

/* Nothing here yet. Artwork sits on the page, no card. `spacious` fills a whole
   empty screen -- leave it off for one empty section on a busy page. */
export function EmptyState({
  illustration,
  title,
  description,
  action,
  spacious = false,
}: {
  illustration?: ComponentChildren
  title: string
  description: string
  action?: ComponentChildren
  spacious?: boolean
}) {
  return (
    <div
      class={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        spacious ? 'min-h-[60svh] py-10' : 'py-8',
      )}
    >
      {illustration && <div class="mb-5 text-content-subtle">{illustration}</div>}
      <p class="text-heading font-semibold">{title}</p>
      <p class="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-content-muted">
        {description}
      </p>
      {action && <div class="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}

export function ErrorNote({ children }: { children: ComponentChildren }) {
  return (
    <p
      role="alert"
      class="flex gap-2 rounded-card bg-danger-soft px-3.5 py-2.5 text-sm text-danger-on-soft"
    >
      {children}
    </p>
  )
}

export function InfoNote({ children }: { children: ComponentChildren }) {
  return <p class="px-1 text-xs leading-relaxed text-content-muted">{children}</p>
}

/** Placeholder while the first query resolves, so the layout does not jump. */
export function Skeleton({ class: className }: { class?: string }) {
  return <div class={cn('animate-pulse rounded-control bg-surface-sunken', className)} />
}
