/**
 * UI primitives.
 *
 * Designed for the actual conditions: a phone, one hand, often standing up
 * with fabric in the other hand, sometimes in direct sun. That drives most of
 * what looks like styling here -- 44px minimum targets, high-contrast text,
 * no hover-only affordances, and colour used sparingly enough that the one
 * colour that means "money owed" is unmissable.
 *
 * Dark mode is supported throughout via `prefers-color-scheme`, because a shop
 * phone follows the owner's system setting and a hard-coded white app is
 * blinding at night.
 *
 * Surfaces are fills, not lines: no borders, no shadows, a near-square radius.
 * The reasoning and the consequences are recorded in index.css. Anything here
 * that wants a hairline to do its job is a sign the spacing is wrong.
 */
import type { ComponentChildren, JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { IconChevronLeft, IconChevronRight, IconSearch } from './icons'
import { useSwipeBack } from '../hooks/useSwipeBack'
import { cn } from '../lib/cn'

export { cn }

/** Minimum comfortable tap target. Below this, mis-taps become common. */
const TAP = 'min-h-11'

/** A raised surface: the only thing that separates it from the page. */
const SURFACE = 'bg-white dark:bg-stone-900'
/** The page itself. Sticky chrome uses this so surfaces vanish behind it. */
const PAGE = 'bg-stone-100 dark:bg-stone-950'
/**
 * A recessed surface: inputs, tracks, tiles.
 *
 * stone-200 rather than stone-100 because a recessed control has to be visible
 * both on a white surface and directly on the stone-100 page -- `SearchInput`
 * does the latter, and a stone-100 field on a stone-100 page is invisible.
 */
const RECESSED = 'bg-stone-200 dark:bg-stone-800'
const TEXT_MUTED = 'text-stone-500 dark:text-stone-400'

// ------------------------------------------------------------------ layout

/**
 * A screen: sticky header, scrolling body.
 *
 * The title stays visible while the content scrolls, which matters on a long
 * order list where it is otherwise easy to lose track of where you are.
 *
 * The header is page-coloured and unblurred rather than a floating bar. It sits
 * directly under the Shell's status strip, which is also page-coloured, so the
 * two read as one quiet block instead of two stacked bars with a hairline
 * between them. Surfaces scrolling under it disappear behind the page.
 *
 * Passing `back` gets both a chevron and an edge-swipe gesture, because in an
 * installed PWA there is no browser chrome and no system back swipe -- see
 * hooks/useSwipeBack.ts.
 */
/**
 * Exactly one of `title` or `label` is required -- never both omitted, which
 * used to compile and render no `h1` at all. `subtitle` rides along with
 * `title` only: it modifies a visible heading, and an orphaned subtitle over
 * a `label`-only tab root (which shows no heading) has nothing to modify.
 */
type ScreenHeading =
  | {
      /** Visible page heading, for pushed screens. */
      title: string
      /** A muted line under `title`. Only makes sense once there is a title to sit under. */
      subtitle?: string
      label?: never
    }
  | {
      /**
       * The accessible name for a tab root, which renders no visible heading
       * (spec A8) -- the active tab already carries that label once, so a title
       * on screen would say it again. The `h1` still needs a name for screen
       * readers and the document outline, just not one anyone sees.
       */
      label: string
      title?: never
      subtitle?: never
    }

export function Screen({
  title,
  label,
  subtitle,
  back,
  action,
  subheader,
  children,
}: ScreenHeading & {
  /** Href for the back chevron and the edge-swipe. Omit on the tab roots. */
  back?: string
  action?: ComponentChildren
  /**
   * Extra sticky content below the heading row, e.g. Book's Orders/Clients
   * switch -- stays in place while `children` scrolls, rather than the switch
   * itself needing to re-implement stickiness.
   */
  subheader?: ComponentChildren
  children: ComponentChildren
}) {
  const swipeRef = useSwipeBack(back)
  const heading = title ?? label
  // A label-only tab root with no back chevron and no action renders nothing
  // visible in this row (the h1 is sr-only) -- collapse its padding instead of
  // reserving ~16px of sticky space for nothing. A subheader still counts as
  // something to show, so the row keeps its top clearance for it.
  const rowHasContent = Boolean(back || title || action)

  return (
    <div ref={swipeRef}>
      <header class={`sticky top-0 z-20 ${PAGE}`}>
        <div
          class={cn(
            'mx-auto flex max-w-lg items-center gap-2 px-4',
            rowHasContent ? 'pt-1 pb-3' : subheader ? 'pt-1' : 'py-0',
          )}
        >
          {back && (
            <a
              href={back}
              aria-label="Back"
              class={`-ml-2.5 flex size-10 shrink-0 items-center justify-center rounded-full
                      text-stone-500 active:bg-stone-200 dark:text-stone-400
                      dark:active:bg-stone-800`}
            >
              <IconChevronLeft size={22} />
            </a>
          )}
          <div class="min-w-0 flex-1">
            <h1
              class={cn(
                'truncate text-[22px] font-semibold leading-tight tracking-tight',
                !title && 'sr-only',
              )}
            >
              {heading}
            </h1>
            {subtitle && <p class={`mt-0.5 truncate text-xs ${TEXT_MUTED}`}>{subtitle}</p>}
          </div>
          {action}
        </div>
        {subheader && <div class="mx-auto max-w-lg px-4 pb-3">{subheader}</div>}
      </header>

      {/* TabBar floats now (1rem inset + its own ~60px height, on top of the
          safe area), so this clears it directly rather than a flat guess. */}
      <div class="mx-auto w-full max-w-lg px-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  )
}

export function Card({
  children,
  class: className,
  padded = true,
}: {
  children: ComponentChildren
  class?: string
  padded?: boolean
}) {
  return (
    <div class={cn('rounded-card', SURFACE, padded && 'p-4', className)}>{children}</div>
  )
}

export function SectionTitle({
  children,
  action,
}: {
  children: ComponentChildren
  action?: ComponentChildren
}) {
  return (
    <div class="mb-2 flex items-baseline justify-between gap-3 px-1">
      <h2 class={cn('text-xs font-semibold tracking-wide', TEXT_MUTED)}>{children}</h2>
      {action}
    </div>
  )
}

// ----------------------------------------------------------------- buttons

type ButtonProps = JSX.IntrinsicElements['button'] & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'md' | 'sm'
  block?: boolean
}

/**
 * Fills only -- a secondary button is a quieter fill, never an outline -- and
 * monochrome, per A27. Colour returns to buttons deliberately or not at all;
 * status colour (overdue red, money amber, the sync ring) is untouched because
 * it encodes meaning rather than emphasis.
 */
const BUTTON_VARIANTS = {
  primary:
    'bg-stone-900 text-white active:bg-stone-800 dark:bg-white dark:text-stone-900 dark:active:bg-stone-200',
  secondary:
    'bg-stone-200 text-stone-800 active:bg-stone-300 dark:bg-stone-800 dark:text-stone-100 dark:active:bg-stone-700',
  danger:
    'bg-red-100 text-red-700 active:bg-red-200 dark:bg-red-950 dark:text-red-300 dark:active:bg-red-900',
  ghost: 'text-stone-600 active:bg-stone-200 dark:text-stone-300 dark:active:bg-stone-800',
} as const

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  class: className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      class={`inline-flex items-center justify-center gap-2 rounded-control
              font-medium transition-[transform,background-color] duration-100
              active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40
              ${size === 'sm' ? 'min-h-9 px-3 text-sm' : `${TAP} px-4 text-[15px]`}
              ${block ? 'w-full' : ''}
              ${BUTTON_VARIANTS[variant]} ${className ?? ''}`}
    />
  )
}

/**
 * A screen header's action. Small, labelled by text where it fits, so a
 * create action does not need a floating button competing with the tab bar's
 * centre action (spec N12 -- `Fab` was deleted, deliberately).
 */
export function HeaderAction({
  href,
  onClick,
  label,
  icon,
}: {
  href?: string
  onClick?: () => void
  label: string
  icon?: ComponentChildren
}) {
  const inner = (
    <>
      {icon}
      {label}
    </>
  )
  const style = cn(
    'flex shrink-0 items-center gap-1 rounded-control px-3 text-sm font-semibold',
    'text-stone-900 active:bg-stone-200 dark:text-white dark:active:bg-stone-800',
    TAP,
  )

  if (href) {
    return (
      <a href={href} class={style}>
        {inner}
      </a>
    )
  }

  return (
    <button type="button" onClick={onClick} class={cn(style, '-mr-2')}>
      {inner}
    </button>
  )
}

// ------------------------------------------------------------------ inputs

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  children: ComponentChildren
}) {
  return (
    <label class="block">
      <span class="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
        {label}
      </span>
      {children}
      {hint && !error && <span class={`mt-1 block text-xs ${TEXT_MUTED}`}>{hint}</span>}
      {error && (
        <span role="alert" class="mt-1 block text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </label>
  )
}

/**
 * A recessed fill with no resting border. The focus ring stays: it is the only
 * thing telling a keyboard or screen-reader user where they are, and dropping
 * it to satisfy "no lines" would be a real accessibility regression rather
 * than a style choice.
 */
const CONTROL_BASE = cn(
  'w-full border-0 text-base text-stone-900 outline-none transition-colors',
  RECESSED,
  'placeholder:text-stone-400',
  'focus:ring-2 focus:ring-inset focus:ring-brand-600',
  'dark:text-stone-100 dark:placeholder:text-stone-500',
)

/** Pill fields need the extra horizontal padding or the text sits on the curve. */
const CONTROL = cn(CONTROL_BASE, 'rounded-control px-4.5')
/** A pill fights a multi-line text block, and search is shaped by its icon. */
const CONTROL_BOXED = cn(CONTROL_BASE, 'rounded-boxed px-3.5')

export function Input({ class: className, ...props }: JSX.IntrinsicElements['input']) {
  return <input {...props} class={cn(TAP, CONTROL, className)} />
}

export function Textarea({ class: className, ...props }: JSX.IntrinsicElements['textarea']) {
  return <textarea {...props} rows={3} class={cn(CONTROL_BOXED, 'py-2.5', className)} />
}

export function Select({ class: className, ...props }: JSX.IntrinsicElements['select']) {
  return <select {...props} class={cn(TAP, CONTROL, 'pr-8', className)} />
}

export function SearchInput({ class: className, ...props }: JSX.IntrinsicElements['input']) {
  return (
    <div class="relative">
      <span class={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${TEXT_MUTED}`}>
        <IconSearch size={18} />
      </span>
      <input {...props} type="search" class={cn(TAP, CONTROL_BOXED, 'pl-10', className)} />
    </div>
  )
}

/**
 * Segmented control for a small, fixed set of filters.
 *
 * Preferred over a `<select>` where the options fit: the current choice and
 * the alternatives are both visible, and switching is one tap rather than
 * three. Falls back to a select above about five options, where the segments
 * get too narrow to hit.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      class={cn(
        'flex gap-1 overflow-x-auto rounded-control p-1',
        RECESSED,
        'scrollbar-none [&::-webkit-scrollbar]:hidden',
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            class={`min-h-9 shrink-0 rounded-control px-3.5 text-sm font-medium
                    transition-colors ${
                      active
                        ? 'bg-white text-stone-900 dark:bg-stone-600 dark:text-white'
                        : 'text-stone-600 dark:text-stone-400'
                    }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ sheets

/**
 * Bottom sheet for forms that interrupt a screen rather than belonging to it.
 *
 * A sheet instead of an inline card because a form pushed inline moves
 * everything below it, and on a phone that means the thing you were looking at
 * jumps off screen the moment you tap Add.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ComponentChildren
}) {
  // Escape closes, and the page behind must not scroll while it is open.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div class="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        class="absolute inset-0 animate-fade-in bg-stone-900/40 backdrop-blur-[2px]"
      />
      <div
        class={`absolute inset-x-0 bottom-0 max-h-[88svh] animate-sheet-in overflow-y-auto
                rounded-card ${SURFACE} safe-bottom`}
      >
        {/* Grab handle. Purely a signal that this is dismissable -- dragging
            is not implemented, and pretending otherwise would be worse. */}
        <div class="sticky top-0 z-10 flex flex-col items-center bg-inherit pt-2.5">
          <span class="h-1 w-9 rounded-full bg-stone-300 dark:bg-stone-600" />
          <h2 class="w-full px-5 pt-3 pb-2 text-lg font-semibold tracking-tight">{title}</h2>
        </div>
        <div class="px-5 pt-1 pb-5">{children}</div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ display

const CHIP_TONES = {
  // stone-200 rather than stone-100 so the fill alone carries it. A chip filled
  // with stone-100 vanishes against the stone-100 page, which is what the ring
  // this replaced was compensating for.
  neutral: 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  bad: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  info: 'bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300',
} as const

export type ChipTone = keyof typeof CHIP_TONES

/** Accent-bar fills, keyed by the same tones `Chip` uses, so one stage is one
 *  colour in a chip and on a bar. `Reports`' local BAR_TONES folds into this in S4. */
export const ACCENT_TONES: Record<ChipTone, string> = {
  neutral: 'bg-stone-400 dark:bg-stone-500',
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  info: 'bg-brand-600',
}

export function Chip({
  tone = 'neutral',
  children,
}: {
  tone?: ChipTone
  children: ComponentChildren
}) {
  return (
    <span
      class={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs
              font-medium ${CHIP_TONES[tone]}`}
    >
      {children}
    </span>
  )
}

/** First letter of up to two words, the way every avatar and initials chip in the app agree on. */
export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
}

/** Circular initials, so a list scans by shape as well as by reading. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      class={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold',
        'text-brand-800 dark:bg-brand-950 dark:text-brand-300',
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
      class="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-stone-100
             dark:active:bg-stone-800"
    >
      {leading}
      <span class="min-w-0 flex-1">{children}</span>
      {trailing ?? <IconChevronRight size={18} class="shrink-0 text-stone-300 dark:text-stone-600" />}
    </a>
  )
}

/**
 * Rows inside a Card. Use with `padded={false}`.
 *
 * No dividers: row padding does the separating. On a list where every row is a
 * wall of similar text that would be too little, which is why `Clients` keeps
 * its avatar column -- the shapes carry the scan the hairlines used to.
 */
export function RowList({ children }: { children: ComponentChildren }) {
  return <ul>{children}</ul>
}

/**
 * A titled card with an optional count, subtitle and footer link. Names the
 * SectionTitle + Card + RowList composite repeated across four screens.
 */
export function SectionCard({
  title,
  count,
  subtitle,
  footer,
  children,
}: {
  title: string
  count?: number
  subtitle?: string
  footer?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <section class={`overflow-hidden rounded-card ${SURFACE}`}>
      <div class="px-4 pt-4 pb-1">
        <h2 class="flex items-baseline gap-1.5 text-[15px] font-semibold tracking-tight">
          {title}
          {count !== undefined && (
            <span class={`text-xs font-normal ${TEXT_MUTED}`}>{count}</span>
          )}
        </h2>
        {subtitle && <p class={`mt-0.5 text-xs ${TEXT_MUTED}`}>{subtitle}</p>}
      </div>
      {children}
      {footer}
    </section>
  )
}

/**
 * A tappable row with a leading tone-coloured bar. Its own anchor rather than a
 * ListRow wrapper, because the bar has to sit flush against the card edge.
 */
export function AccentRow({
  href,
  tone = 'neutral',
  trailing,
  children,
}: {
  href: string
  tone?: ChipTone
  trailing?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <a
      href={href}
      class={`flex items-stretch gap-3 pr-4 transition-colors active:bg-stone-100
              dark:active:bg-stone-800 ${TAP}`}
    >
      <span class={`w-0.75 shrink-0 rounded-r-full ${ACCENT_TONES[tone]}`} aria-hidden="true" />
      <span class="min-w-0 flex-1 py-2.5">{children}</span>
      {trailing && <span class="flex shrink-0 items-center py-2.5">{trailing}</span>}
    </a>
  )
}

/** A large tabular figure. `money` is the only toned variant -- see index.css. */
export function StatValue({
  value,
  tone = 'default',
}: {
  value: string
  tone?: 'default' | 'money'
}) {
  return (
    <p
      class={cn(
        'text-3xl font-semibold leading-none tabular-nums tracking-tight',
        tone === 'money' && 'text-amber-700 dark:text-amber-400',
      )}
    >
      {value}
    </p>
  )
}

/** A card's one labelled way out. Used instead of an overflow menu (spec N10). */
export function MoreLink({ href, children }: { href: string; children: ComponentChildren }) {
  return (
    <a
      href={href}
      class={`flex items-center justify-between gap-2 px-4 pb-1 text-sm
              font-medium text-stone-900 transition-colors active:bg-stone-100
              dark:text-white dark:active:bg-stone-800 ${TAP}`}
    >
      {children}
      <IconChevronRight size={16} class="shrink-0" />
    </a>
  )
}

/**
 * A screen (or section) with nothing in it yet.
 *
 * No box around the illustration and no card around the whole thing (spec
 * A11/A1) -- artwork sits directly on the page, the way it would in the
 * reference apps this shell follows.
 *
 * `spacious` opts into filling the room a whole empty screen actually has,
 * centring in it rather than sitting padded from the top. It is a prop
 * rather than the default because half the call sites are one section on an
 * otherwise busy page (a client's empty order history, a staff screen with a
 * footnote below) -- giving those the same vertical reach as a blank Today
 * would shove real content around it out of view for no reason.
 */
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
  /** `true` centres and fills a whole empty screen; `false` (default) sits compact, for one empty section on an otherwise busy page. */
  spacious?: boolean
}) {
  return (
    <div
      class={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        spacious ? 'min-h-[60svh] py-10' : 'py-8',
      )}
    >
      {illustration && (
        <div class="mb-5 text-stone-400 dark:text-stone-600">{illustration}</div>
      )}
      <p class="text-xl font-semibold tracking-tight">{title}</p>
      <p class={`mx-auto mt-2 max-w-xs text-[15px] leading-relaxed ${TEXT_MUTED}`}>
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
      class="flex gap-2 rounded-card bg-red-100 px-3.5 py-2.5
             text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
    >
      {children}
    </p>
  )
}

export function InfoNote({ children }: { children: ComponentChildren }) {
  return (
    <p class={`px-1 text-xs leading-relaxed ${TEXT_MUTED}`}>{children}</p>
  )
}

/** Key/value line, used in every detail panel. */
export function DataRow({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="flex items-baseline justify-between gap-4 py-1.5">
      <dt class={`text-sm ${TEXT_MUTED}`}>{label}</dt>
      <dd class="text-right text-sm font-medium">{children}</dd>
    </div>
  )
}

/**
 * Placeholder shown while the first query resolves. Prevents the layout jump
 * from empty to full, which on a slow phone reads as the app glitching.
 */
export function Skeleton({ class: className }: { class?: string }) {
  return (
    <div
      class={`animate-pulse rounded-control bg-stone-200 dark:bg-stone-800 ${className ?? ''}`}
    />
  )
}
