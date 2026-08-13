/* Which design is mounted, kept live: attaching a trackpad to a tablet swaps
   the shell without a reload. The decision itself is in lib/platform.ts. */
import { useEffect, useState } from 'preact/hooks'
import { currentPlatform, watchPlatform, type Platform } from '../lib/platform'

export function usePlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(currentPlatform)

  useEffect(() => watchPlatform(setPlatform), [])

  return platform
}
