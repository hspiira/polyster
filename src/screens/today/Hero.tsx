/**
 * The Today statement. Emphasis comes from the model's tone tags, so this
 * component makes no editorial decisions of its own.
 */
import { cn } from '../../lib/cn'
import type { HeroSegment, HeroTone } from './todayModel'

const TONES: Record<HeroTone, string> = {
  muted: 'text-stone-400 dark:text-stone-500',
  strong: 'font-semibold text-stone-900 dark:text-stone-50',
  alert: 'font-semibold text-red-600 dark:text-red-400',
  money: 'font-semibold text-amber-700 dark:text-amber-400',
}

export function Hero({
  segments,
  greeting,
}: {
  segments: readonly HeroSegment[]
  greeting?: string
}) {
  return (
    <header class="mb-5">
      {greeting && (
        <p class="mb-1.5 text-xs text-stone-500 dark:text-stone-400">{greeting}</p>
      )}
      <p class="text-2xl leading-snug tracking-tight">
        {segments.map((segment, index) => (
          <span key={index} class={cn(TONES[segment.tone])}>
            {segment.text}
          </span>
        ))}
      </p>
    </header>
  )
}
