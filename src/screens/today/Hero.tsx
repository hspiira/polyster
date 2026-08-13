/* The Today statement. Emphasis comes from the model's tone tags, so this
   component makes no editorial decisions of its own. */
import { cn } from '../../lib/cn'
import type { HeroSegment, HeroTone } from './todayModel'

// `content-subtle`, not a lighter role: the connectives are quiet but still
// text, and anything lighter falls under AA on the page fill.
const TONES: Record<HeroTone, string> = {
  muted: 'text-content-subtle',
  strong: 'font-semibold text-content',
  alert: 'font-semibold text-danger',
  money: 'font-semibold text-money',
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
