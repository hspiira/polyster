import { useEffect, useState } from 'preact/hooks'

/**
 * Whether the browser thinks it has a network connection.
 *
 * `navigator.onLine` is a weak signal -- it reports link state, not whether
 * Supabase is actually reachable. It is good enough for showing the user a
 * connection indicator; it is not used to decide whether a write is allowed,
 * because in this app every write goes to the local database regardless.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
