/* When the device locks, and how hard it pushes back on a wrong PIN. The PIN is
   attribution, not security (D4), so this delays and never locks out. */
export const DEFAULT_LOCK_AFTER_MINUTES = 5

const FREE_ATTEMPTS = 5
const FIRST_DELAY_MS = 1_000
const MAX_DELAY_MS = 30_000

/** `lockAfterMinutes` of 0 means never. */
export function isLockedByIdle(
  backgroundedAt: number | null,
  now: number,
  lockAfterMinutes: number,
): boolean {
  if (backgroundedAt === null) return false
  if (lockAfterMinutes <= 0) return false

  const elapsed = now - backgroundedAt
  // A backwards clock cannot be reasoned about, so fail closed and lock.
  if (elapsed < 0) return true
  return elapsed >= lockAfterMinutes * 60_000
}

export function backoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures < FREE_ATTEMPTS) return 0
  const doublings = consecutiveFailures - FREE_ATTEMPTS
  return Math.min(FIRST_DELAY_MS * 2 ** doublings, MAX_DELAY_MS)
}
