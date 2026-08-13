/**
 * The period row: plain words, the active one on a pill.
 *
 * Not `Segmented` -- that draws a filled track and reads as a filter control
 * competing with the screen title. A period is closer to a heading than to a
 * form field, so only the active word carries a surface.
 */
import { PERIOD_OPTIONS, type PeriodKey, type PeriodRange } from '../lib/period'
import { Input } from './Field'
import { cn } from '../lib/cn'

export function PeriodBar({
  value,
  onChange,
}: {
  value: PeriodKey
  onChange: (next: PeriodKey) => void
}) {
  return (
    <div role="tablist" aria-label="Period" class="-mx-1 flex items-center gap-1 overflow-x-auto">
      {PERIOD_OPTIONS.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            class={cn(
              'min-h-9 shrink-0 rounded-control px-3 text-[15px] whitespace-nowrap',
              'transition-colors',
              active
                ? 'bg-surface-sunken font-semibold text-content'
                : 'font-medium text-content-subtle hover:text-content',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** The two dates behind `Customise`. Shown only while that period is active. */
export function PeriodRangeFields({
  range,
  onChange,
}: {
  range: PeriodRange
  onChange: (next: PeriodRange) => void
}) {
  return (
    <div class="mt-2 flex items-center gap-2">
      <Input
        type="date"
        value={range.from}
        max={range.to}
        aria-label="From"
        onInput={(e) => onChange({ ...range, from: (e.target as HTMLInputElement).value })}
      />
      <span class="shrink-0 text-sm text-content-muted">to</span>
      <Input
        type="date"
        value={range.to}
        min={range.from}
        aria-label="To"
        onInput={(e) => onChange({ ...range, to: (e.target as HTMLInputElement).value })}
      />
    </div>
  )
}
