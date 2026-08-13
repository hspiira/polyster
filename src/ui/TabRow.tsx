/* Plain words, the active one on a pill. Not Segmented: a filter switch sits
   closer to a heading than an input, so only the active word gets a surface. */
import { cn } from '../lib/cn'

export interface TabOption<T extends string> {
  value: T
  label: string
  /* Open tab only: five labels with counts do not fit 320px, and a row that
     scrolls hides the tabs at its end. */
  count?: number
}

export function TabRow<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly TabOption<T>[]
  onChange: (next: T) => void
  label: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      class="-mx-1 flex items-center gap-0.5 overflow-x-auto"
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
              'min-h-9 shrink-0 rounded-control px-2 text-sm whitespace-nowrap',
              'transition-colors',
              active
                ? 'bg-surface-sunken font-semibold text-content'
                : 'font-medium text-content-subtle hover:text-content',
            )}
          >
            {option.label}
            {active && option.count !== undefined && (
              <span class="ml-1 text-xs tabular-nums text-content-muted">{option.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
