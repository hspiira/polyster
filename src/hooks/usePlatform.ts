/**
 * Which design is mounted, kept live.
 *
 * Subscribed rather than read once so attaching a trackpad to a tablet, or
 * overriding the preference, swaps the shell without a reload. The decision
 * itself is in lib/platform.ts; this hook only holds it in state.
 */
import { useEffect, useState } from 'preact/hooks'
import { currentPlatform, watchPlatform, type Platform } from '../lib/platform'

export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(currentPlatform)

  useEffect(() => watchPlatform(setPlatform), [])

  return platform
}
