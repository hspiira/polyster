/**
 * The Today statement. Emphasis comes from the model's tone tags, so this
 * component makes no editorial decisions of its own.
 */
import { cn } from '../../lib/cn'
import type { HeroSegment, HeroTone } from './todayModel'

// stone-500, not stone-400: the connectives are quiet but they are still text,
// and stone-400 on the stone-100 page is about 2.3:1, under AA even at this
// size. Quiet has to stop short of unreadable in sunlight.
const TONES: Record<HeroTone, string> = {
  muted: 'text-stone-500 dark:text-stone-400',
  strong: 'font-semibold text-stone-900 dark:text-stone-50',
  alert: 'font-semibold text-red-600 dark:text-red-400',
  money: 'font-semibold text-amber-700 dark:text-amber-400',
}

export function Hero({ segments }: { segments: readonly HeroSegment[] }) {
  return (
    <header class="mt-1 mb-4">
      <p class="text-[22px] leading-[1.25] tracking-tight text-balance">
        {segments.map((segment, index) => (
          <span key={index} class={cn(TONES[segment.tone])}>
            {segment.text}
          </span>
        ))}
      </p>
    </header>
  )
}
