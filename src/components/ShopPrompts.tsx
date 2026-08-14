/* The two asks registration no longer makes, shown once there is real work to
   lose. Backing up comes first: a lost shop beats a lost home screen icon. */
import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { useAuth } from '../hooks/useAuth'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { useShop } from '../state/ShopProvider'
import { useRxQuery } from '../hooks/useRxQuery'
import { claimShop } from '../db/writes'
import { CLAIM_REMINDER_DAYS, dismissalHolds } from '../lib/prompts'
import { ClaimShop } from '../screens/entry/ClaimShop'
import { ReAuth } from '../screens/entry/ReAuth'
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

/* The backup ask is stamped rather than flagged, so it can come back. Losing a
   home screen icon is recoverable; losing the only copy of the work is not. */
function dismissedForNow(key: string): boolean {
  try {
    return dismissalHolds(localStorage.getItem(key), new Date(), CLAIM_REMINDER_DAYS)
  } catch {
    return false
  }
}

function dismissUntilLater(key: string): void {
  try {
    localStorage.setItem(key, new Date().toISOString())
  } catch {
    // Private browsing. The prompt reappears, which is the safe direction.
  }
}

export function ShopPrompts() {
  const { state: auth } = useAuth()
  const { db, shop } = useShop()
  const install = useInstallPrompt()
  const [claiming, setClaiming] = useState(false)
  const [reauthing, setReauthing] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [hidClaim, setHidClaim] = useState(() => dismissedForNow(DISMISSED_CLAIM))
  const [hidInstall, setHidInstall] = useState(() => dismissed(DISMISSED_INSTALL))
  const claimingNow = useRef(false)

  // "Real work" is one saved order. Before that there is nothing worth the
  // interruption, and the standing line in SyncBadge is telling the truth anyway.
  const orders = useRxQuery(() => db.orders.find({ limit: 1 }).$, [db], [])
  const hasWork = orders.length > 0

  const unclaimed =
    auth.status !== 'local_only' && shop !== null && !shop.supabase_auth_user_id

  /* A live session plus an unclaimed local shop means the back-up flow finished.
     Reactive, because a provider redirect unmounts the screen that would call back. */
  useEffect(() => {
    if (auth.status !== 'signed_in' || !shop || shop.supabase_auth_user_id) return
    if (claimingNow.current) return
    claimingNow.current = true
    claimShop(db, shop.id, auth.userId)
      .then(() => {
        setClaiming(false)
        setClaimError(null)
      })
      .catch((err: unknown) => {
        setClaimError(err instanceof Error ? err.message : 'Could not back up this shop.')
      })
      .finally(() => {
        claimingNow.current = false
      })
  }, [auth, shop, db])

  // Over the shell, not inside it: these are entry screens and would otherwise
  // draw a dark panel in the middle of the page with the tab bar still up.
  if (claiming) {
    return (
      <div class="fixed inset-0 z-50 overflow-y-auto">
        <ClaimShop onCancel={() => setClaiming(false)} />
      </div>
    )
  }

  if (reauthing) {
    return (
      <div class="fixed inset-0 z-50 overflow-y-auto">
        <ReAuth onDone={() => setReauthing(false)} onCancel={() => setReauthing(false)} />
      </div>
    )
  }

  // Outranks the others: nothing on this device reaches the server until it is
  // fixed, and unlike them it cannot be dismissed into silence.
  if (auth.status === 'session_expired') {
    return (
      <Prompt
        icon={<IconAlert size={18} />}
        tone="alert"
        title="This phone has stopped syncing"
        body="Its sign-in has expired. Nothing is lost -- new work is saving here and will go up once you sign in again."
        actionLabel="Sign in again"
        onAction={() => setReauthing(true)}
      />
    )
  }

  if (claimError) {
    return (
      <Prompt
        icon={<IconAlert size={18} />}
        tone="alert"
        title="That account could not take this shop"
        body={claimError}
        actionLabel="Try another account"
        onAction={() => {
          setClaimError(null)
          setClaiming(true)
        }}
        onDismiss={() => setClaimError(null)}
      />
    )
  }

  if (hasWork && unclaimed && !hidClaim) {
    return (
      <Prompt
        icon={<IconAlert size={18} />}
        tone="money"
        title="Your work is only on this phone"
        body="Add an email and password and it is saved off the device. It is also how you get back in on a new phone."
        actionLabel="Back up my shop"
        onAction={() => setClaiming(true)}
        onDismiss={() => {
          dismissUntilLater(DISMISSED_CLAIM)
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
  tone: 'money' | 'alert' | 'neutral'
  title: string
  body: string
  actionLabel: string
  onAction: () => void
  /** Omitted where the prompt must not be dismissable. */
  onDismiss?: () => void
}) {
  const skin =
    tone === 'money'
      ? 'bg-money-soft text-money-on-soft'
      : tone === 'alert'
        ? 'bg-danger-soft text-danger-on-soft'
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
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            class="min-h-11 rounded-control px-4 text-sm font-medium opacity-70"
          >
            Not now
          </button>
        )}
      </div>
    </div>
  )
}
