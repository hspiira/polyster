/* One component, so Sales, Expenses and Reports cannot disagree about what
   "30 days" means. */
import { cn } from '../lib/cn'
import { CONTROL_SM, RADIUS, TEXT_SM } from './chrome'

export type RangeKey = '7' | '30' | '90'

/** Inclusive of today, which is why the window is `days - 1` back from now. */
export const RANGES: Record<RangeKey, { days: number; label: string }> = {
  '7': { days: 7, label: '7 days' },
  '30': { days: 30, label: '30 days' },
  '90': { days: 90, label: '90 days' },
}

const ORDER: readonly RangeKey[] = ['7', '30', '90']

export function PeriodSwitch({
  value,
  onChange,
}: {
  value: RangeKey
  onChange: (next: RangeKey) => void
}) {
  return (
    <span class={cn('flex gap-1 bg-surface-sunken p-0.5', RADIUS)} role="group" aria-label="Period">
      {ORDER.map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          class={cn(
            'px-2.5 font-medium',
            CONTROL_SM,
            RADIUS,
            TEXT_SM,
            value === key
              ? 'bg-surface font-semibold text-content'
              : 'text-content-muted hover:text-content',
          )}
        >
          {RANGES[key].label}
        </button>
      ))}
    </span>
  )
}
