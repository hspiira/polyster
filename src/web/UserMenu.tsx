/** Who you are, the theme, and the way to Settings. */
import { useEffect, useRef, useState } from 'preact/hooks'
import { useShop } from '../state/ShopProvider'
import { getInitials } from '../ui'
import { IconChevronRight, IconSettings } from '../components/icons'
import { useTheme } from '../hooks/useTheme'
import { cn } from '../lib/cn'
import { CONTROL, RADIUS, TEXT_SM, TEXT_XS } from './chrome'
import type { ThemePreference } from '../lib/theme'

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function UserMenu() {
  const { shop, activeStaff } = useShop()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const [theme, chooseTheme] = useTheme()

  return (
    <div ref={wrap} class="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        class={cn('flex items-center gap-1.5 pl-0.5 pr-1.5 hover:bg-hover', CONTROL, RADIUS)}
      >
        <span
          class="grid size-[22px] place-items-center rounded-full bg-accent-soft text-[9px]
                 font-bold text-accent-on-soft"
          aria-hidden="true"
        >
          {activeStaff ? getInitials(activeStaff.name) : '··'}
        </span>
        <IconChevronRight size={11} class="rotate-90 text-content-subtle" />
      </button>

      {open && (
        <div
          role="menu"
          class={cn(
            'absolute right-0 top-[calc(100%+4px)] z-40 w-[15rem] overflow-hidden bg-surface',
            'shadow-overlay',
            RADIUS,
          )}
        >
          <div class="px-3 py-2.5">
            <p class={cn('font-semibold', TEXT_SM)}>{activeStaff?.name ?? 'No one signed in'}</p>
            <p class={cn('truncate text-content-muted', TEXT_XS)}>{shop?.name}</p>
          </div>

          <div class="border-t border-line px-3 py-2">
            <p
              class={cn(
                'mb-1 font-semibold uppercase tracking-[0.06em] text-content-subtle',
                TEXT_XS,
              )}
            >
              Theme
            </p>
            {THEME_OPTIONS.map((option) => {
              const active = theme === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => chooseTheme(option.value)}
                  class={cn(
                    'flex w-full items-baseline gap-2 px-2 py-1.5 text-left',
                    RADIUS,
                    active ? 'bg-accent-soft text-accent-on-soft' : 'hover:bg-hover',
                  )}
                >
                  <span class={cn('flex-1 font-medium', TEXT_SM)}>{option.label}</span>
                  {active && <span aria-hidden="true">✓</span>}
                </button>
              )
            })}
          </div>

          <a
            href="/settings"
            onClick={() => setOpen(false)}
            class={cn(
              'flex items-center gap-2 border-t border-line px-3 py-2.5 hover:bg-hover',
              TEXT_SM,
            )}
          >
            <IconSettings size={14} />
            Settings
          </a>
        </div>
      )}
    </div>
  )
}
