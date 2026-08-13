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
import { normalizeTone, TONE_SOFT, TONE_SOLID, type AnyTone } from './tones'

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
 * The settings row: tinted icon, label, and either a value and a chevron or a
 * control. The icon tile carries the brand colour by default -- on a screen
 * that is otherwise all greys and text, it is the only thing telling you whose
 * app this is.
 *
 * `href` makes the row a link; without one it renders as a plain row, for a
 * `trailing` control that is itself the whole interaction (a `Switch`).
 */
export function SettingRow({
  icon,
  label,
  hint,
  value,
  href,
  tone = 'accent',
  trailing,
}: {
  icon: ComponentChildren
  label: string
  /** A second line, for a setting whose name does not explain it. */
  hint?: string
  /** The current setting, shown before the chevron -- "English", "5 minutes". */
  value?: string
  href?: string
  tone?: AnyTone
  /** Replaces the chevron. A control, not decoration. */
  trailing?: ComponentChildren
}) {
  const body = (
    <>
      <span
        class={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-[0.6rem]',
          TONE_SOFT[normalizeTone(tone)],
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-[15px] font-medium">{label}</span>
        {hint && <span class="mt-0.5 block text-xs leading-snug text-content-muted">{hint}</span>}
      </span>
      {value && <span class="shrink-0 text-sm text-content-muted">{value}</span>}
      {trailing ?? (href && <IconChevronRight size={18} class="shrink-0 text-content-subtle" />)}
    </>
  )

  const shape = cn('flex min-h-tap items-center gap-3 py-2.5', ROW_INSET)

  return href ? (
    <a href={href} class={cn(shape, 'transition-colors hover:bg-hover active:bg-pressed')}>
      {body}
    </a>
  ) : (
    <div class={shape}>{body}</div>
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
