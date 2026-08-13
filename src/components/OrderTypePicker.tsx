/* One line, not a five-way row: the form opens on what this shop takes most
   often, and five labels across 375px is 70px each. */
import { useState } from 'preact/hooks'
import { Sheet, cn } from './ui'
import { IconCheck, IconChevronRight } from './icons'
import { ORDER_TYPE_ICONS, ORDER_TYPE_LABELS } from '../screens/orderStage'
import type { OrderType } from '../db/schema'

const HINTS: Record<OrderType, string> = {
  tailor_made: 'Made to their measurements',
  rental: 'Goes out and comes back',
  purchase: 'Sold as it is, off the shelf',
  pre_order: 'Promised before it is made',
  repair: 'Altering or mending something they own',
}

export function OrderTypePicker({
  value,
  options,
  onChange,
  onOpenChange,
}: {
  value: OrderType
  options: readonly OrderType[]
  onChange: (type: OrderType) => void
  /** So a pinned action bar can get out of the way while this is up. */
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const Icon = ORDER_TYPE_ICONS[value]

  function show(next: boolean) {
    setOpen(next)
    onOpenChange?.(next)
  }

  // Nothing to switch between.
  if (options.length <= 1) {
    return (
      <p class="flex items-center gap-2 px-1 text-[13px] text-content-muted">
        <Icon size={16} />
        {ORDER_TYPE_LABELS[value]}
      </p>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => show(true)}
        class="flex min-h-tap w-full items-center gap-2 rounded-control px-1 text-left
               transition-colors active:bg-pressed"
      >
        <span class="text-accent">
          <Icon size={18} />
        </span>
        <span class="flex-1 text-[15px] font-medium">{ORDER_TYPE_LABELS[value]}</span>
        <span class="flex shrink-0 items-center gap-0.5 text-[13px] text-content-muted">
          Change
          <IconChevronRight size={15} />
        </span>
      </button>

      <Sheet open={open} title="What kind of order?" onClose={() => show(false)}>
        <ul>
          {options.map((type) => {
            const TypeIcon = ORDER_TYPE_ICONS[type]
            const active = type === value
            return (
              <li key={type}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(type)
                    show(false)
                  }}
                  class={cn(
                    'flex min-h-tap w-full items-center gap-3 rounded-control px-2 py-2 text-left',
                    'transition-colors active:bg-pressed',
                  )}
                >
                  <span class={active ? 'text-accent' : 'text-content-subtle'}>
                    <TypeIcon size={20} />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-[15px] font-medium">{ORDER_TYPE_LABELS[type]}</span>
                    <span class="block text-[13px] text-content-muted">{HINTS[type]}</span>
                  </span>
                  {active && (
                    <span class="shrink-0 text-accent">
                      <IconCheck size={18} />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </Sheet>
    </>
  )
}
