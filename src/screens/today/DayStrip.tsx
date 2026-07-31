/**
 * Seven days of workload. Informational: a cell links out to the order list
 * for that day rather than filtering this screen (spec N7).
 */
import { formatDate } from '../../lib/dates'
import { cn } from '../../lib/cn'
import type { DayCell } from './todayModel'

/**
 * Today is marked by a rule beneath its cell, not by a card. There is no
 * selection state to show -- tapping navigates away rather than filtering this
 * screen (spec N7) -- so a filled tile would be claiming something untrue.
 */
export function DayStrip({ cells }: { cells: readonly DayCell[] }) {
  return (
    <nav aria-label="The week ahead" class="mb-6 flex">
      {cells.map((cell) => (
        <a
          key={cell.date}
          href={`/orders?due=${cell.date}`}
          aria-label={cell.count === 0 ? `Nothing due on ${formatDate(cell.date)}` : `${cell.count} due on ${formatDate(cell.date)}`}
          class="group flex min-h-16 flex-1 flex-col items-center gap-1 pt-1"
        >
          <span class="text-[11px] text-stone-500 dark:text-stone-400">
            {cell.weekdayInitial}
          </span>
          <span
            class={cn(
              'text-[15px] tabular-nums',
              cell.isToday
                ? 'font-semibold text-stone-900 dark:text-stone-50'
                : 'text-stone-500 dark:text-stone-400',
            )}
          >
            {cell.dayOfMonth}
          </span>
          {cell.countLabel ? (
            <span class="text-[11px] font-semibold tabular-nums text-brand-700 dark:text-brand-300">
              {cell.countLabel}
            </span>
          ) : (
            <span class="text-[11px] text-stone-300 dark:text-stone-700" aria-hidden="true">
              ·
            </span>
          )}
          <span
            aria-hidden="true"
            class={cn(
              'mt-auto h-0.5 w-5 rounded-full',
              cell.isToday ? 'bg-brand-700 dark:bg-brand-400' : 'bg-transparent',
            )}
          />
        </a>
      ))}
    </nav>
  )
}
