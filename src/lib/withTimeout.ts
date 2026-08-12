/**
 * Races a promise against a timeout so a stalled request (e.g. a fetch that
 * never resolves after a stale page reloads offline) fails fast with a clear
 * message instead of leaving the UI stuck on a loading state forever.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}
