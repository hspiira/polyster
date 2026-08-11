/**
 * Status chips and identity marks. Colour comes from `tones.ts`, so a chip and
 * an accent bar of the same tone match without either being told what to be.
 */
import type { ComponentChildren } from 'preact'
import { cn } from '../lib/cn'
import { normalizeTone, TONE_SOFT, type AnyTone } from './tones'

export function Chip({
  tone = 'neutral',
  children,
}: {
  tone?: AnyTone
  children: ComponentChildren
}) {
  return (
    <span
      class={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1',
        'text-xs font-medium',
        TONE_SOFT[normalizeTone(tone)],
      )}
    >
      {children}
    </span>
  )
}

/** First letter of up to two words. The one definition of initials in the app. */
export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
}

/**
 * Circular initials, so a list scans by shape as well as by reading.
 * `aria-hidden` because the name it derives from is always adjacent.
 */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      class={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        'bg-accent-soft text-accent-on-soft',
        size === 'sm' && 'size-7 text-[11px]',
        size === 'md' && 'size-10 text-sm',
        size === 'lg' && 'size-11 text-base',
      )}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  )
}
