import { useLocation } from 'preact-iso'
import { backTarget } from '../lib/navigation'

/** The back href for the current screen: where you came from, or its owner. */
export function useBack(): string {
  const { path } = useLocation()
  return backTarget(path)
}
