/**
 * The status vocabulary. A tone is a meaning, not a colour -- `money` is an
 * outstanding balance, `danger` is overdue or destructive. What each is worth
 * is decided in styles/theme.css.
 *
 * No JSX here on purpose, so logic modules can classify a record without
 * pulling a component into a node-environment test.
 */

export type Tone = 'neutral' | 'accent' | 'success' | 'money' | 'danger'

/**
 * The pre-redesign names, still accepted so screens can be converted one at a
 * time rather than in a single sweep.
 *
 * @deprecated Use `Tone`. Removed once every screen is converted.
 */
export type LegacyTone = 'info' | 'good' | 'warn' | 'bad' | 'alert' | 'default'

export type AnyTone = Tone | LegacyTone

const LEGACY: Record<LegacyTone, Tone> = {
  info: 'accent',
  good: 'success',
  warn: 'money',
  bad: 'danger',
  // `Chip` and `StatTile` had disjoint tone sets before this file existed --
  // one said `bad`, the other said `alert`, for the same red. Both land here.
  alert: 'danger',
  default: 'neutral',
}

export function normalizeTone(tone: AnyTone): Tone {
  return tone in LEGACY ? LEGACY[tone as LegacyTone] : (tone as Tone)
}

/**
 * Soft fill paired with a foreground that is readable on it. Always take the
 * pair -- a fill picked without its text has no guaranteed contrast.
 */
export const TONE_SOFT: Record<Tone, string> = {
  neutral: 'bg-neutral-soft text-neutral-on-soft',
  accent: 'bg-accent-soft text-accent-on-soft',
  success: 'bg-success-soft text-success-on-soft',
  money: 'bg-money-soft text-money-on-soft',
  danger: 'bg-danger-soft text-danger-on-soft',
}

/** Solid fill, for accent bars and meters. Same tone, same colour, everywhere. */
export const TONE_SOLID: Record<Tone, string> = {
  neutral: 'bg-content-subtle',
  accent: 'bg-accent',
  success: 'bg-success',
  money: 'bg-money',
  danger: 'bg-danger',
}

/** Text-only, for a figure or a date that has to carry its own status. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-content-muted',
  accent: 'text-accent',
  success: 'text-success',
  money: 'text-money',
  danger: 'text-danger',
}
