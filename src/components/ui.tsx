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
 */
import type { ComponentChildren, JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { IconChevronLeft, IconChevronRight, IconSearch } from './icons'

/** Minimum comfortable tap target. Below this, mis-taps become common. */
const TAP = 'min-h-11'

const SURFACE = 'bg-white dark:bg-stone-900'
const BORDER = 'border-stone-200/80 dark:border-stone-800'
const TEXT_MUTED = 'text-stone-500 dark:text-stone-400'

// ------------------------------------------------------------------ layout

/**
 * A screen: sticky header, scrolling body.
 *
 * The title stays visible while the content scrolls, which matters on a long
 * order list where it is otherwise easy to lose track of where you are.
 */
export function Screen({
  title,
  subtitle,
  back,
  action,
  children,
}: {
  title: string
  subtitle?: string
  /** Href for a back chevron. Omit on the four tab roots. */
  back?: string
  action?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <>
      <header
        class={`sticky top-0 z-20 border-b ${BORDER} ${SURFACE} backdrop-blur-lg
                supports-[backdrop-filter]:bg-white/75
                dark:supports-[backdrop-filter]:bg-stone-900/75`}
      >
        <div class="mx-auto flex max-w-lg items-center gap-2 px-4 py-3">
          {back && (
            <a
              href={back}
              aria-label="Back"
              class={`-ml-2 flex size-10 shrink-0 items-center justify-center rounded-full
                      text-stone-600 active:bg-stone-100 dark:text-stone-300
                      dark:active:bg-stone-800`}
            >
              <IconChevronLeft size={22} />
            </a>
          )}
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-lg font-semibold tracking-tight">{title}</h1>
            {subtitle && <p class={`truncate text-xs ${TEXT_MUTED}`}>{subtitle}</p>}
          </div>
          {action}
        </div>
      </header>

      <div class="mx-auto w-full max-w-lg px-4 pt-4 pb-28">{children}</div>
    </>
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
    <div
      class={`rounded-card border ${BORDER} ${SURFACE} shadow-card
              ${padded ? 'p-4' : ''} ${className ?? ''}`}
    >
      {children}
    </div>
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
      <h2 class={`text-xs font-semibold uppercase tracking-wider ${TEXT_MUTED}`}>{children}</h2>
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

const BUTTON_VARIANTS = {
  primary:
    'bg-brand-700 text-white shadow-card active:bg-brand-800 dark:bg-brand-600 dark:active:bg-brand-700',
  secondary:
    'border border-stone-300 bg-white text-stone-800 active:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:active:bg-stone-700',
  danger:
    'border border-red-300 bg-white text-red-700 active:bg-red-50 dark:border-red-900 dark:bg-stone-800 dark:text-red-400',
  ghost: 'text-stone-600 active:bg-stone-100 dark:text-stone-300 dark:active:bg-stone-800',
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
 * Floating action button for a screen's single most likely action.
 *
 * Sits above the tab bar and clear of the home indicator. One per screen --
 * two floating buttons is a menu, and a menu belongs in the flow.
 */
export function Fab({
  href,
  onClick,
  label,
  icon,
}: {
  href?: string
  onClick?: () => void
  label: string
  icon: ComponentChildren
}) {
  // Offset clears the tab bar and the home indicator beneath it.
  const style = `fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-20 flex
                 size-14 items-center justify-center rounded-full bg-brand-700 text-white
                 shadow-raised transition-transform active:scale-95
                 dark:bg-brand-600`

  if (href) {
    return (
      <a href={href} aria-label={label} class={style}>
        {icon}
      </a>
    )
  }

  return (
    <button type="button" aria-label={label} onClick={onClick} class={style}>
      {icon}
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

const CONTROL = `w-full rounded-control border border-stone-300 bg-white px-3.5
                 text-base text-stone-900 outline-none transition-colors
                 placeholder:text-stone-400
                 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20
                 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100
                 dark:placeholder:text-stone-500`

export function Input({ class: className, ...props }: JSX.IntrinsicElements['input']) {
  return <input {...props} class={`${TAP} ${CONTROL} ${className ?? ''}`} />
}

export function Textarea({ class: className, ...props }: JSX.IntrinsicElements['textarea']) {
  return <textarea {...props} rows={3} class={`${CONTROL} py-2.5 ${className ?? ''}`} />
}

export function Select({ class: className, ...props }: JSX.IntrinsicElements['select']) {
  return <select {...props} class={`${TAP} ${CONTROL} pr-8 ${className ?? ''}`} />
}

export function SearchInput({ class: className, ...props }: JSX.IntrinsicElements['input']) {
  return (
    <div class="relative">
      <span class={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${TEXT_MUTED}`}>
        <IconSearch size={18} />
      </span>
      <input {...props} type="search" class={`${TAP} ${CONTROL} pl-10 ${className ?? ''}`} />
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
      class="flex gap-1 overflow-x-auto rounded-control bg-stone-200/70 p-1
             dark:bg-stone-800/80 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
            class={`min-h-9 shrink-0 rounded-[0.55rem] px-3 text-sm font-medium
                    transition-colors ${
                      active
                        ? 'bg-white text-stone-900 shadow-card dark:bg-stone-700 dark:text-white'
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
                rounded-t-3xl ${SURFACE} shadow-sheet safe-bottom`}
      >
        {/* Grab handle. Purely a signal that this is dismissable -- dragging
            is not implemented, and pretending otherwise would be worse. */}
        <div class="sticky top-0 z-10 flex flex-col items-center bg-inherit pt-2.5">
          <span class="h-1 w-9 rounded-full bg-stone-300 dark:bg-stone-600" />
          <h2 class="w-full px-5 pt-3 pb-2 text-base font-semibold">{title}</h2>
        </div>
        <div class="px-5 pt-1 pb-5">{children}</div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ display

const CHIP_TONES = {
  // Ringed rather than filled. A chip filled with stone-100 vanishes against
  // the stone-100 page background, which is where the dashboard puts them.
  neutral:
    'bg-stone-100 text-stone-700 ring-1 ring-inset ring-stone-300/70 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700',
  good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  bad: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  info: 'bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300',
} as const

export type ChipTone = keyof typeof CHIP_TONES

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

/** Circular initials, so a client list scans by shape as well as by reading. */
export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()

  return (
    <span
      class="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100
             text-sm font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-300"
      aria-hidden="true"
    >
      {initials}
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
      class="flex items-center gap-3 px-4 py-3 transition-colors active:bg-stone-100
             dark:active:bg-stone-800"
    >
      {leading}
      <span class="min-w-0 flex-1">{children}</span>
      {trailing ?? <IconChevronRight size={18} class="shrink-0 text-stone-400" />}
    </a>
  )
}

/** Rows inside a Card, hairline-separated. Use with `padded={false}`. */
export function RowList({ children }: { children: ComponentChildren }) {
  return (
    <ul class="divide-y divide-stone-100 dark:divide-stone-800">{children}</ul>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ComponentChildren
  title: string
  description: string
  action?: ComponentChildren
}) {
  return (
    <div class="px-6 py-12 text-center">
      {icon && (
        <div
          class="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl
                 bg-stone-200/70 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
        >
          {icon}
        </div>
      )}
      <p class="font-semibold">{title}</p>
      <p class={`mx-auto mt-1 max-w-xs text-sm ${TEXT_MUTED}`}>{description}</p>
      {action && <div class="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function ErrorNote({ children }: { children: ComponentChildren }) {
  return (
    <p
      role="alert"
      class="flex gap-2 rounded-control border border-red-200 bg-red-50 px-3 py-2.5
             text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
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
