/**
 * Rows without columns: settings menus, history lists, key/value lines. Use
 * `DataList` instead when a row has facts worth aligning against other rows.
 *
 * No dividers -- padding separates. Where that is too little, the fix is a
 * leading shape (`Avatar`, `AccentRow`'s bar), not a hairline.
 */
import type { ComponentChildren } from 'preact'
import { IconChevronRight } from '../components/icons'
import { cn } from '../lib/cn'
import { normalizeTone, TONE_SOLID, type AnyTone } from './tones'

/** Rows inside a `Card`. Use with `padded={false}`. */
export function RowList({ children }: { children: ComponentChildren }) {
  return <ul>{children}</ul>
}

/** A tappable row. An anchor, so long-press and middle-click behave. */
export function ListRow({
  href,
  leading,
  trailing,
  children,
}: {
  href: string
  leading?: ComponentChildren
  trailing?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <a
      href={href}
      class="flex min-h-tap items-center gap-3 px-gutter py-3 transition-colors
             hover:bg-hover active:bg-pressed"
    >
      {leading}
      <span class="min-w-0 flex-1">{children}</span>
      {trailing ?? <IconChevronRight size={18} class="shrink-0 text-content-subtle" />}
    </a>
  )
}

/** A tappable row with a leading tone-coloured bar, flush to the card edge. */
export function AccentRow({
  href,
  tone = 'neutral',
  trailing,
  children,
}: {
  href: string
  tone?: AnyTone
  trailing?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <a
      href={href}
      class="flex min-h-tap items-stretch gap-3 pr-gutter transition-colors
             hover:bg-hover active:bg-pressed"
    >
      <span
        class={cn('w-1 shrink-0 rounded-r-full', TONE_SOLID[normalizeTone(tone)])}
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1 py-2.5">{children}</span>
      {trailing && <span class="flex shrink-0 items-center py-2.5">{trailing}</span>}
    </a>
  )
}

/** Key/value line, used in every detail panel. */
export function DataRow({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="flex items-baseline justify-between gap-4 py-1.5">
      <dt class="text-sm text-content-muted">{label}</dt>
      <dd class="text-right text-sm font-medium">{children}</dd>
    </div>
  )
}

/** A card's one labelled way out. Used instead of an overflow menu. */
export function MoreLink({ href, children }: { href: string; children: ComponentChildren }) {
  return (
    <a
      href={href}
      class="flex min-h-tap items-center justify-between gap-2 px-gutter pb-1 text-sm
             font-medium text-accent transition-colors hover:bg-hover"
    >
      {children}
      <IconChevronRight size={16} class="shrink-0" />
    </a>
  )
}
