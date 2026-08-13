/** The period row. See `TabRow` -- this is that, fixed to `PeriodKey`. */
import { PERIOD_OPTIONS, type PeriodKey, type PeriodRange } from '../lib/period'
import { Input } from './Field'
import { TabRow } from './TabRow'

export function PeriodBar({
  value,
  onChange,
}: {
  value: PeriodKey
  onChange: (next: PeriodKey) => void
}) {
  return <TabRow value={value} options={PERIOD_OPTIONS} onChange={onChange} label="Period" />
}

/**
 * Which currency the figures are in, at the right of the filters row.
 *
 * A filter, not a converter: it narrows the report to rows recorded in that
 * currency. Converting would need an exchange rate this app has no offline
 * source for, and a made-up rate is a made-up figure.
 *
 * With one currency in the books there is nothing to choose, so it reads as a
 * label -- the screen still needs to say what unit the amounts are in, since
 * they no longer carry a symbol each.
 */
export function CurrencySwitch({
  value,
  options,
  onChange,
}: {
  value: string
  options: readonly string[]
  onChange: (next: string) => void
}) {
  if (options.length < 2) {
    return (
      <span class="shrink-0 px-1 text-sm font-medium text-content-muted tabular-nums">{value}</span>
    )
  }

  return (
    <label class="shrink-0">
      <span class="sr-only">Currency</span>
      <select
        value={value}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
        class="min-h-9 rounded-control border-0 bg-surface-sunken px-2 text-sm font-medium
               text-content outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
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
