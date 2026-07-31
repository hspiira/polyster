/**
 * Seven days of workload. Informational: a cell links out to the order list
 * for that day rather than filtering this screen (spec N7).
 */
import { cn } from '../../lib/cn'
import type { DayCell } from './todayModel'

export function DayStrip({ cells }: { cells: readonly DayCell[] }) {
  return (
    <nav aria-label="The week ahead" class="mb-5 flex gap-1">
      {cells.map((cell) => (
        <a
          key={cell.date}
          href={`/orders?due=${cell.date}`}
          aria-label={`${cell.count} due on ${cell.date}`}
          class={cn(
            'flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-boxed',
            'transition-colors active:bg-stone-200 dark:active:bg-stone-800',
            cell.isToday && 'bg-white shadow-card dark:bg-stone-900',
          )}
        >
          <span class="text-[10px] text-stone-400 dark:text-stone-500">
            {cell.weekdayInitial}
          </span>
          <span
            class={cn(
              'text-sm tabular-nums',
              cell.isToday ? 'font-semibold' : 'text-stone-600 dark:text-stone-300',
            )}
          >
            {cell.dayOfMonth}
          </span>
          {cell.countLabel ? (
            <span
              class="rounded-full bg-brand-100 px-1.5 text-[10px] font-semibold tabular-nums
                     text-brand-800 dark:bg-brand-950 dark:text-brand-300"
            >
              {cell.countLabel}
            </span>
          ) : (
            <span class="text-[10px] text-stone-300 dark:text-stone-700" aria-hidden="true">
              ·
            </span>
          )}
        </a>
      ))}
    </nav>
  )
}
