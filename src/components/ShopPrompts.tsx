/**
 * The two asks that registration no longer makes.
 *
 * Both are shown once there is real work on the device, which is the first
 * moment either of them means anything, and both can be dismissed for good.
 * Backing up comes first: losing a shop is worse than losing a home screen icon.
 */
import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { useAuth } from '../hooks/useAuth'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { useShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { ClaimShop } from '../screens/entry/ClaimShop'
import { IconAlert, IconDownload } from './icons'

const DISMISSED_CLAIM = 'polyster.dismissed.claim'
const DISMISSED_INSTALL = 'polyster.dismissed.install'

function dismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function dismiss(key: string): void {
  try {
    localStorage.setItem(key, '1')
  } catch {
    // Private browsing. The prompt reappears, which is the safe direction.
  }
}

export function ShopPrompts() {
  const { state: auth } = useAuth()
  const { db, shop } = useShop()
  const install = useInstallPrompt()
  const [claiming, setClaiming] = useState(false)
  const [hidClaim, setHidClaim] = useState(() => dismissed(DISMISSED_CLAIM))
  const [hidInstall, setHidInstall] = useState(() => dismissed(DISMISSED_INSTALL))

  // "Real work" is one saved order. Before that there is nothing worth the
  // interruption, and the standing line in SyncBadge is telling the truth anyway.
  const orders = useRxQuery(() => db.orders.find({ limit: 1 }).$, [db], [])
  const hasWork = orders.length > 0

  // Over the shell, not inside it: ClaimShop is an entry screen and would
  // otherwise draw a dark panel in the middle of the page with the tab bar still up.
  if (claiming) {
    return (
      <div class="fixed inset-0 z-50 overflow-y-auto">
        <ClaimShop onDone={() => setClaiming(false)} onCancel={() => setClaiming(false)} />
      </div>
    )
  }

  const unclaimed =
    auth.status !== 'local_only' && shop !== null && !shop.supabase_auth_user_id

  if (hasWork && unclaimed && !hidClaim) {
    return (
      <Prompt
        icon={<IconAlert size={18} />}
        tone="amber"
        title="Your work is only on this phone"
        body="Add your number and it is saved off the device. It is also how you get back in on a new phone."
        actionLabel="Add my number"
        onAction={() => setClaiming(true)}
        onDismiss={() => {
          dismiss(DISMISSED_CLAIM)
          setHidClaim(true)
        }}
      />
    )
  }

  if (hasWork && !install.isStandalone && install.canPrompt && !hidInstall) {
    return (
      <Prompt
        icon={<IconDownload size={18} />}
        tone="neutral"
        title="Keep Polyster on your home screen"
        body="This is what lets it open with no internet. In a browser tab it can be lost when you close it."
        actionLabel="Add to home screen"
        onAction={() => void install.prompt()}
        onDismiss={() => {
          dismiss(DISMISSED_INSTALL)
          setHidInstall(true)
        }}
      />
    )
  }

  return null
}

function Prompt({
  icon,
  tone,
  title,
  body,
  actionLabel,
  onAction,
  onDismiss,
}: {
  icon: ComponentChildren
  tone: 'amber' | 'neutral'
  title: string
  body: string
  actionLabel: string
  onAction: () => void
  onDismiss: () => void
}) {
  const skin =
    tone === 'amber'
      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
      : 'bg-surface-raised text-content'

  return (
    <div class={`rounded-card p-4 ${skin}`}>
      <div class="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      <p class="mt-1.5 text-sm opacity-90">{body}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAction}
          class="min-h-11 rounded-control bg-accent px-4 text-sm font-semibold text-accent-content"
        >
          {actionLabel}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          class="min-h-11 rounded-control px-4 text-sm font-medium opacity-70"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
