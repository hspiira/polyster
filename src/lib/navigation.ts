/* Where a pushed screen's back chevron points. Back must be a real href for the
   edge swipe, so this reconstructs the last place you were, or the IA owner. */
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

/* A task, not a destination: it has its own Cancel and leaving discards a
   draft. Never a place to send someone back to. */
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
