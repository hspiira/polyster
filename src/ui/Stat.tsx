/**
 * Figures: the row of numbers a screen leads with.
 *
 * `StatStrip` uses `auto-fit`, not breakpoints, so it reflows on available
 * space rather than window size and stays correct inside a sidebar. Copy this
 * for any grid here -- `grid-cols-2 md:grid-cols-3` is a worse version of it.
 */
import type { ComponentChildren } from 'preact'
import { cn } from '../lib/cn'
import { normalizeTone, TONE_TEXT, type AnyTone } from './tones'

export function StatStrip({ children }: { children: ComponentChildren }) {
  return (
    <div class="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">{children}</div>
  )
}

export function StatTile({
  label,
  children,
  tone = 'neutral',
}: {
  label: string
  children: ComponentChildren
  tone?: AnyTone
}) {
  const resolved = normalizeTone(tone)
  return (
    <div class="rounded-card bg-surface px-4 py-3.5 shadow-raise">
      <p class="text-xs font-medium text-content-muted">{label}</p>
      <p
        class={cn(
          'mt-1 text-xl font-semibold tracking-tight tabular-nums',
          resolved === 'neutral' ? 'text-content' : TONE_TEXT[resolved],
        )}
      >
        {children}
      </p>
    </div>
  )
}

/** A large standalone figure, for a screen whose point is one number. */
export function StatValue({
  value,
  tone = 'neutral',
}: {
  value: string
  tone?: AnyTone
}) {
  const resolved = normalizeTone(tone)
  return (
    <p
      class={cn(
        'text-display font-semibold tabular-nums',
        resolved === 'neutral' ? 'text-content' : TONE_TEXT[resolved],
      )}
    >
      {value}
    </p>
  )
}
