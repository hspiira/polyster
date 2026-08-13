/**
 * A row of plain words, the active one on a pill.
 *
 * Not `Segmented` -- that draws a filled track and reads as a form control.
 * A filter switch sits closer to a heading than to an input, so only the
 * active word carries a surface; the rest are just text you can tap.
 */
import { cn } from '../lib/cn'

export interface TabOption<T extends string> {
  value: T
  label: string
  /**
   * Shown on the open tab only.
   *
   * Five labels each carrying a count do not fit a 320px phone, and a row that
   * scrolls hides the tabs at its end -- which is the whole point of the row.
   * The count that matters is the one for the list you are looking at.
   */
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
