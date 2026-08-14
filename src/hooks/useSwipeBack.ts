import { useEffect, useRef } from 'preact/hooks'
import { useLocation } from 'preact-iso'

/* Edge-swipe back, which an installed PWA has no native version of. Left edge
   only, abandoned the moment the drag looks vertical, and it follows the finger. */

/** Only swipes starting this close to the left edge count. */
const EDGE_ZONE_PX = 28
/** Past this, releasing completes the navigation. */
const COMPLETE_PX = 90
/** Below this much horizontal movement, direction is still ambiguous. */
const DIRECTION_LOCK_PX = 10

export function useSwipeBack(target: string | (() => void) | undefined) {
  const location = useLocation()
  const ref = useRef<HTMLDivElement>(null)
  // A ref, not state: re-rendering the whole screen at 60fps to move it
  // sideways drops frames on the hardware this targets.
  const drag = useRef({ startX: 0, startY: 0, active: false, locked: false })
  // Read at completion time, not closed over, so a fresh inline callback still resolves correctly.
  const targetRef = useRef(target)
  targetRef.current = target

  useEffect(() => {
    const node = ref.current
    if (!target || !node) return

    function setOffset(px: number, animate: boolean) {
      if (!node) return
      node.style.transition = animate ? 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none'
      node.style.transform = px === 0 ? '' : `translateX(${px}px)`
    }

    function onTouchStart(event: TouchEvent) {
      const touch = event.touches[0]
      if (!touch || event.touches.length > 1) return
      if (touch.clientX > EDGE_ZONE_PX) return
      drag.current = { startX: touch.clientX, startY: touch.clientY, active: true, locked: false }
    }

    function onTouchMove(event: TouchEvent) {
      const state = drag.current
      const touch = event.touches[0]
      if (!state.active || !touch) return

      const dx = touch.clientX - state.startX
      const dy = touch.clientY - state.startY

      if (!state.locked) {
        if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return
        // Vertical, or a leftward drag: not ours. Hand it back.
        if (Math.abs(dy) > Math.abs(dx) || dx <= 0) {
          state.active = false
          return
        }
        state.locked = true
      }

      // Only now, once the gesture is definitely a back-swipe, is it safe to
      // stop the page scrolling underneath it.
      if (event.cancelable) event.preventDefault()
      // Resistance past the completion point, so the drag has a felt limit.
      setOffset(dx > COMPLETE_PX ? COMPLETE_PX + (dx - COMPLETE_PX) * 0.3 : dx, false)
    }

    function onTouchEnd(event: TouchEvent) {
      const state = drag.current
      if (!state.active) return
      drag.current = { ...state, active: false, locked: false }

      const touch = event.changedTouches[0]
      const dx = touch ? touch.clientX - state.startX : 0

      if (dx > COMPLETE_PX) {
        // Slide the rest of the way out before navigating, so the new screen
        // does not appear on top of a half-dragged old one.
        setOffset(window.innerWidth, true)
        window.setTimeout(() => {
          setOffset(0, false)
          const current = targetRef.current
          if (typeof current === 'function') current()
          else if (current) location.route(current)
        }, 150)
      } else {
        setOffset(0, true)
      }
    }

    // Not passive: onTouchMove has to be able to preventDefault once it knows
    // the gesture is a back-swipe.
    node.addEventListener('touchstart', onTouchStart, { passive: true })
    node.addEventListener('touchmove', onTouchMove, { passive: false })
    node.addEventListener('touchend', onTouchEnd, { passive: true })
    node.addEventListener('touchcancel', onTouchEnd, { passive: true })

    return () => {
      node.removeEventListener('touchstart', onTouchStart)
      node.removeEventListener('touchmove', onTouchMove)
      node.removeEventListener('touchend', onTouchEnd)
      node.removeEventListener('touchcancel', onTouchEnd)
      node.style.transform = ''
      node.style.transition = ''
    }
  }, [Boolean(target), location])

  return ref
}
