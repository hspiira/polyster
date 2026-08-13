import { IconCheck } from '../../components/icons'
import { STAGE_LABELS } from '../orderStage'
import type { OrderStage } from '../../db/schema'

/** Connected dots rather than loose chips, so the sequence reads as a path. */
export function StageTrack({
  flow,
  current,
}: {
  flow: readonly OrderStage[]
  current: OrderStage
}) {
  const currentIndex = flow.indexOf(current)

  return (
    <ol class="flex items-start">
      {flow.map((stage, index) => {
        const done = index < currentIndex
        const active = index === currentIndex
        return (
          <li key={stage} class="flex flex-1 flex-col items-center">
            <div class="flex w-full items-center">
              <span
                class={`h-0.5 flex-1 ${index === 0 ? 'opacity-0' : ''} ${
                  index <= currentIndex ? 'bg-accent' : 'bg-neutral-soft'
                }`}
              />
              <span
                class={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs
                        font-semibold transition-colors ${
                          done
                            ? 'bg-accent text-accent-content'
                            : active
                              ? 'bg-accent-hover text-accent-content ring-4 ring-accent/20'
                              : 'bg-neutral-soft text-neutral-on-soft'
                        }`}
              >
                {done ? <IconCheck size={14} /> : index + 1}
              </span>
              <span
                class={`h-0.5 flex-1 ${index === flow.length - 1 ? 'opacity-0' : ''} ${
                  index < currentIndex ? 'bg-accent' : 'bg-neutral-soft'
                }`}
              />
            </div>
            <span
              class={`mt-1.5 px-0.5 text-center text-[11px] leading-tight ${
                active
                  ? 'font-semibold text-content'
                  : 'text-content-muted'
              }`}
            >
              {STAGE_LABELS[stage]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
