/**
 * Where a pushed screen's back chevron points.
 *
 * `Screen`'s back has to be a real href -- the edge-swipe gesture and a cold
 * deep link both need one -- so this reconstructs what history.back() would
 * have done: the last place you actually were. Failing that (a deep link, a
 * cold start), the route's owner in the IA.
 *
 * A screen therefore never has to name a parent, which is what made Sales send
 * you to Settings from the Money tab: two hubs link to it and only one was
 * written down.
 */
const MAX_VISITS = 12

const visits: string[] = []

/** Only for routes whose owner is not their path prefix. */
const OWNERS: Record<string, string> = {
  '/settings': '/',
  '/sales': '/money',
  '/expenses': '/money',
  '/reports': '/money',
  '/catalogue': '/settings',
  '/collections': '/settings',
  '/suppliers': '/settings',
  '/materials': '/settings',
  '/inventory': '/settings',
  '/production': '/settings',
  '/garment-units': '/settings',
}

/**
 * A task, not a destination: it has its own Cancel, and leaving it discards a
 * draft. Never a place to send someone back to.
 */
export function isFullScreenTask(path: string): boolean {
  return path === '/orders/new' || path === '/sales/new' || /^\/orders\/[^/]+\/edit$/.test(path)
}

export function ownerOf(path: string): string {
  const owner = OWNERS[path]
  if (owner) return owner
  const prefix = path.slice(0, path.lastIndexOf('/'))
  return prefix || '/'
}

export function recordVisit(path: string): void {
  if (visits[visits.length - 1] === path) return
  visits.push(path)
  if (visits.length > MAX_VISITS) visits.shift()
}

export function backTarget(currentPath: string): string {
  for (let i = visits.length - 1; i >= 0; i -= 1) {
    const visited = visits[i]!
    if (visited === currentPath) continue
    if (isFullScreenTask(visited)) continue
    // Deeper than here, so backing into it would be going forwards.
    if (visited.startsWith(`${currentPath === '/' ? '' : currentPath}/`)) continue
    return visited
  }
  return ownerOf(currentPath)
}

/** Test seam. */
export function resetVisits(): void {
  visits.length = 0
}
