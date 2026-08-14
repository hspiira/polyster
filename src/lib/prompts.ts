/* When a dismissed ask comes back. Dismissing the backup prompt means "not now",
   not "never": an unclaimed shop's only copy of its work is on the phone. */

/** Long enough not to nag, short enough that a week's work is not the stake. */
export const CLAIM_REMINDER_DAYS = 7

/** True while a dismissal still counts. `raw` is what was stored when dismissed. */
export function dismissalHolds(raw: string | null, now: Date, days: number): boolean {
  if (!raw) return false
  const at = new Date(raw).getTime()
  // Unreadable means ask, not stay silent: that covers the '1' an older build
  // wrote, and errs toward offering a backup.
  if (Number.isNaN(at)) return false
  // A clock that moved backwards would otherwise silence the prompt for as long
  // as the skew lasts.
  if (at > now.getTime()) return false
  return now.getTime() - at < days * 86_400_000
}
