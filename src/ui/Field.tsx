/**
 * Form controls.
 *
 * `text-base` (16px) is load-bearing, not taste: below it iOS zooms the
 * viewport on focus and does not zoom back out.
 *
 * Focus is drawn once in index.css. Do not restyle it here.
 */
import type { ComponentChildren, JSX } from 'preact'
import { IconSearch } from '../components/icons'
import { cn } from '../lib/cn'

const CONTROL = cn(
  'w-full rounded-control border-0 bg-surface-sunken px-3.5 text-base text-content',
  'outline-none transition-colors placeholder:text-content-subtle',
)

export function Input({ class: className, ...props }: JSX.IntrinsicElements['input']) {
  return <input {...props} class={cn('min-h-tap', CONTROL, className)} />
}

export function Textarea({ class: className, ...props }: JSX.IntrinsicElements['textarea']) {
  return <textarea {...props} rows={3} class={cn(CONTROL, 'py-2.5', className)} />
}

export function Select({ class: className, ...props }: JSX.IntrinsicElements['select']) {
  return <select {...props} class={cn('min-h-tap', CONTROL, 'pr-8', className)} />
}

export function SearchInput({ class: className, ...props }: JSX.IntrinsicElements['input']) {
  return (
    <div class="relative">
      <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-content-subtle">
        <IconSearch size={18} />
      </span>
      <input {...props} type="search" class={cn('min-h-tap', CONTROL, 'pl-10', className)} />
    </div>
  )
}

/** Label, control, and exactly one of hint or error underneath. */
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
      <span class="mb-1.5 block text-sm font-medium text-content">{label}</span>
      {children}
      {hint && !error && <span class="mt-1 block text-xs text-content-muted">{hint}</span>}
      {error && (
        <span role="alert" class="mt-1 block text-xs text-danger">
          {error}
        </span>
      )}
    </label>
  )
}

/**
 * On/off for a single setting.
 *
 * A `Segmented` with On and Off in it was doing this job, which reads as two
 * choices to compare rather than one thing that is either on or not -- and cost
 * two tap targets and a row of chrome per setting. Seventeen of them stacked is
 * what made the modules screen unreadable.
 *
 * The knob is `bg-surface` in both states so it never has to be told which
 * theme it is in; the track carries the state.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Named for screen readers -- the visible label is a sibling, not a child. */
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      class="flex min-h-tap shrink-0 items-center disabled:pointer-events-none disabled:opacity-40"
    >
      {/* The track is 44x24 -- proportionate to a 15px label. The 44px tap
          floor is met by the button around it, not by the drawing. */}
      <span
        class={cn(
          'flex h-6 w-11 items-center rounded-pill p-0.5 transition-colors',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <span
          class={cn(
            'block size-5 rounded-full bg-surface shadow-raise',
            'transition-transform duration-100',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  )
}

/**
 * Segmented control for a small, fixed set of filters. Use a `<select>` above
 * about five options, where the segments get too narrow to hit.
 */
/** Wraps rather than scrolls: a hidden option is an option nobody picks. */
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
      class="flex flex-wrap gap-1 rounded-control bg-surface-sunken p-1"
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
            class={cn(
              'min-h-9 flex-1 rounded-[calc(var(--r-control)-0.25rem)] px-3',
              'text-sm font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-surface text-content shadow-raise'
                : 'text-content-muted hover:text-content',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
