import { useTheme } from '../hooks/useTheme'
import { cn } from '../lib/cn'
import type { ThemePreference } from '../lib/theme'

const OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** Three segments, because "system" has to stay reachable once it is left. */
export function ThemeChoice() {
  const [preference, choose] = useTheme()

  return (
    <div role="group" aria-label="Theme" class="flex gap-1 rounded-control bg-surface-sunken p-1">
      {OPTIONS.map((option) => {
        const active = preference === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => choose(option.value)}
            class={cn(
              'min-h-11 flex-1 rounded-control px-3 text-sm font-medium transition-colors',
              active ? 'bg-surface text-content shadow-raise' : 'text-content-muted',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
