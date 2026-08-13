/* Form controls. `text-base` is load-bearing: below 16px iOS zooms on focus and
   does not zoom back. Focus is drawn once in index.css. */
import type { ComponentChildren, JSX } from 'preact'
import { IconSearch } from '../components/icons'
import { cn } from '../lib/cn'

const CONTROL = cn(
  'w-full rounded-control border-0 bg-surface-sunken px-3.5 text-base text-content',
  'outline-none transition-colors placeholder:text-content-subtle',
)

/* `onValue` exists so screens stop writing (e.target as HTMLInputElement).value
   at every field. `onInput` still works where the event itself is wanted. */
type ValueProps = { onValue?: (value: string) => void }

function valueHandler<E extends { target: EventTarget | null }>(
  onValue: ((value: string) => void) | undefined,
  onInput: ((event: E) => void) | undefined,
) {
  if (!onValue) return onInput
  return (event: E) => {
    onValue((event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value)
    onInput?.(event)
  }
}

export function Input({
  class: className,
  onValue,
  onInput,
  ...props
}: JSX.IntrinsicElements['input'] & ValueProps) {
  return (
    <input
      {...props}
      onInput={valueHandler(onValue, onInput)}
      class={cn('min-h-tap', CONTROL, className)}
    />
  )
}

export function Textarea({
  class: className,
  onValue,
  onInput,
  ...props
}: JSX.IntrinsicElements['textarea'] & ValueProps) {
  return (
    <textarea
      {...props}
      onInput={valueHandler(onValue, onInput)}
      rows={3}
      class={cn(CONTROL, 'py-2.5', className)}
    />
  )
}

export function Select({
  class: className,
  onValue,
  onChange,
  ...props
}: JSX.IntrinsicElements['select'] & ValueProps) {
  return (
    <select
      {...props}
      onChange={valueHandler(onValue, onChange)}
      class={cn('min-h-tap', CONTROL, 'pr-8', className)}
    />
  )
}

export function SearchInput({
  class: className,
  onValue,
  onInput,
  ...props
}: JSX.IntrinsicElements['input'] & ValueProps) {
  return (
    <div class="relative">
      <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-content-subtle">
        <IconSearch size={18} />
      </span>
      <input
        {...props}
        onInput={valueHandler(onValue, onInput)}
        type="search"
        class={cn('min-h-tap', CONTROL, 'pl-10', className)}
      />
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

/* On/off for one setting. A Segmented reads as two choices to compare and costs
   two tap targets. The knob is bg-surface in both states; the track carries it. */
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
      {/* 40x22. The 44px tap floor is the button around it, not the drawing. */}
      <span
        class={cn(
          'flex h-[1.375rem] w-10 items-center rounded-pill p-0.5 transition-colors',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <span
          class={cn(
            'block size-[1.125rem] rounded-full bg-surface shadow-raise',
            'transition-transform duration-100',
            checked ? 'translate-x-[1.125rem]' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  )
}

/* Segmented control for a small fixed set of filters; a <select> above about
   five. Wraps rather than scrolls -- a hidden option is one nobody picks. */
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
