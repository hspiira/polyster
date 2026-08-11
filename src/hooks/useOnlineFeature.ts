import { useOnline } from './useOnline'
import { isSupabaseConfigured } from '../lib/supabaseClient'

/** Whether an online-only module (src/online/) can be used right now. */
export function useOnlineFeature(): boolean {
  return useOnline() && isSupabaseConfigured()
}
