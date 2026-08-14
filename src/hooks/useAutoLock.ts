/* Locks after too long in the background. `visibilitychange`, not a timer: a
   backgrounded tab's timers are throttled or frozen. */
import { useEffect, useRef } from 'preact/hooks'
import { isLockedByIdle } from '../lib/lockPolicy'

export function useAutoLock(lockAfterMinutes: number, onLock: () => void): void {
  const backgroundedAt = useRef<number | null>(null)
  const onLockRef = useRef(onLock)
  onLockRef.current = onLock

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        backgroundedAt.current = Date.now()
        return
      }
      if (isLockedByIdle(backgroundedAt.current, Date.now(), lockAfterMinutes)) {
        onLockRef.current()
      }
      backgroundedAt.current = null
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [lockAfterMinutes])
}
