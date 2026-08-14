/* Registered once at the shell, so a shortcut cannot mean two things. Every
   handler bails while typing: naming an order "Navy suit" must not open one. */
import { useEffect } from 'preact/hooks'

/** True when the event came from somewhere a character is expected. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export interface Shortcuts {
  /** ⌘K / Ctrl-K. Also `/`, which costs nothing and is muscle memory for many. */
  onSearch: () => void
  /** N. */
  onNew: () => void
  /** Escape, when nothing else has claimed it. */
  onEscape?: () => void
}

export function useShortcuts({ onSearch, onNew, onEscape }: Shortcuts): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey

      if (meta && event.key.toLowerCase() === 'k') {
        // Chrome gives ⌘K to the address bar, so this has to be claimed.
        event.preventDefault()
        onSearch()
        return
      }

      if (isTyping(event.target)) return

      if (event.key === '/') {
        event.preventDefault()
        onSearch()
        return
      }

      if (event.key === 'Escape') {
        onEscape?.()
        return
      }

      // Bare letters only. ⌘N is the browser's new window and stays the
      // browser's; taking it would be the app overreaching.
      if (meta || event.altKey) return

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        onNew()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onSearch, onNew, onEscape])
}
