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
import { normalizeTone, TONE_SOLID, TONE_TEXT, type AnyTone } from './tones'

/**
 * A row's inset, fixed rather than `--gutter`.
 *
 * `--gutter` is the *page* gutter and grows to 2rem on a desktop. A row inside
 * a `Card` already sits inside that gutter, so reusing it here indented the row
 * twice -- 4rem before the first glyph on a wide screen. A flush card is the
 * exception: it cancels the page gutter with `-mx-gutter`, so its rows do want
 * `--gutter` back (see `.data-row` in styles/components.css).
 */
const ROW_INSET = 'px-4'

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
      class={cn(
        'flex min-h-tap items-center gap-3 py-3 transition-colors',
        'hover:bg-hover active:bg-pressed',
        ROW_INSET,
      )}
    >
      {leading}
      <span class="min-w-0 flex-1">{children}</span>
      {trailing ?? <IconChevronRight size={18} class="shrink-0 text-content-subtle" />}
    </a>
  )
}

/**
 * The settings row: bare accent icon, name, current value, chevron. Dense --
 * `min-h-tap` is the whole height, so a group of eight reads as one block
 * rather than eight cards' worth of scrolling.
 */
export function SettingRow({
  icon,
  label,
  value,
  href,
  onClick,
  tone = 'accent',
  trailing,
}: {
  icon: ComponentChildren
  label: string
  value?: string
  href?: string
  onClick?: () => void
  tone?: AnyTone
  trailing?: ComponentChildren
}) {
  const activates = Boolean(href || onClick)
  const resolved = normalizeTone(tone)
  const body = (
    <>
      <span class={cn('shrink-0', TONE_TEXT[resolved])} aria-hidden="true">
        {icon}
      </span>
      <span
        class={cn(
          'min-w-0 flex-1 truncate text-[15px]',
          resolved === 'danger' ? 'font-medium text-danger' : 'text-content',
        )}
      >
        {label}
      </span>
      {value && <span class="shrink-0 truncate text-sm text-content-muted">{value}</span>}
      {trailing ??
        (activates && <IconChevronRight size={17} class="shrink-0 text-content-subtle" />)}
    </>
  )

  const shape = cn('flex min-h-tap w-full items-center gap-3 py-1.5 text-left', ROW_INSET)
  const pressable = 'transition-colors hover:bg-hover active:bg-pressed'

  if (href) {
    return (
      <a href={href} class={cn(shape, pressable)}>
        {body}
      </a>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} class={cn(shape, pressable)}>
        {body}
      </button>
    )
  }
  return <div class={shape}>{body}</div>
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
      class={cn(
        'flex min-h-tap items-center justify-between gap-2 pb-1 text-sm',
        'font-medium text-accent transition-colors hover:bg-hover',
        ROW_INSET,
      )}
    >
      {children}
      <IconChevronRight size={16} class="shrink-0" />
    </a>
  )
}
