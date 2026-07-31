/**
 * Everything the Today screen derives, as pure functions.
 *
 * Kept out of the component so it is testable without a component-test
 * harness -- the same reason orderStage.ts exists. Nothing here imports Preact
 * or RxDB.
 */
import { formatMoney } from '../../lib/money'
import type { OrderStage } from '../../db/schema'

/** Stages that still need something doing. Finished work is not "due". */
export const OPEN_STAGES: readonly OrderStage[] = ['measured', 'in_progress', 'ready']

export type HeroTone = 'muted' | 'strong' | 'alert' | 'money'

export interface HeroSegment {
  text: string
  tone: HeroTone
}

export interface HeroCounts {
  late: number
  dueToday: number
  dueThisWeek: number
  outstanding: number
}

/**
 * The hero statement, as tone-tagged segments rather than a string, so the
 * emphasis is data and the component stays dumb.
 */
export function heroSegments(counts: HeroCounts): HeroSegment[] {
  const segments: HeroSegment[] = []

  if (counts.late > 0) {
    segments.push({ text: 'You have ', tone: 'muted' })
    segments.push({ text: `${counts.late} late`, tone: 'alert' })
    if (counts.dueToday > 0) {
      segments.push({ text: ', ', tone: 'muted' })
      segments.push({ text: `${counts.dueToday} due today`, tone: 'strong' })
    }
  } else if (counts.dueToday > 0) {
    segments.push({ text: 'You have ', tone: 'muted' })
    segments.push({ text: `${counts.dueToday} due today`, tone: 'strong' })
  } else if (counts.dueThisWeek > 0) {
    segments.push({ text: 'You have ', tone: 'muted' })
    segments.push({ text: `${counts.dueThisWeek} due this week`, tone: 'strong' })
  } else {
    segments.push({ text: 'Nothing due today', tone: 'strong' })
  }

  if (counts.outstanding > 0) {
    segments.push({ text: ' and ', tone: 'muted' })
    segments.push({ text: `${formatMoney(counts.outstanding)} owed`, tone: 'money' })
  }

  return segments
}
