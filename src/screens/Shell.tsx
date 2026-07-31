/**
 * The authenticated app shell.
 *
 * A thin status strip, a scrolling screen area, and a fixed tab bar. The tab
 * bar is `fixed` rather than `sticky` so it survives the iOS URL bar
 * collapsing on scroll, which otherwise makes a sticky bar jump.
 *
 * ## Routing
 *
 * `preact-iso` with real history URLs rather than hash routing. The usual
 * objection -- a deep link 404s on refresh -- does not apply:
 * vite-plugin-pwa's generateSW mode sets `navigateFallback: 'index.html'` by
 * default, so the service worker answers every navigation from the precached
 * shell, offline included.
 */
import { Route, Router } from 'preact-iso'
import { TabBar } from '../components/TabBar'
import { SyncBadge } from '../components/SyncBadge'
import { Avatar } from '../components/ui'
import { IconSettings } from '../components/icons'
import { useShop } from '../state/ShopProvider'
import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../hooks/useReplication'

import { Today } from './today/Today'
import { Clients } from './Clients'
import { ClientDetail } from './ClientDetail'
import { Orders } from './Orders'
import { OrderDetail } from './OrderDetail'
import { OrderForm } from './OrderForm'
import { Settings } from './Settings'
import { ShopSettings } from './settings/ShopSettings'
import { MeasurementFieldSettings } from './settings/MeasurementFieldSettings'
import { StaffSettings } from './settings/StaffSettings'
import { BackupSettings } from './settings/BackupSettings'
import { Reports } from './Reports'
import { NotFound } from './NotFound'

interface ShellProps {
  online: boolean
  auth: AuthState
  replication: ReplicationStatus
}

export function Shell({ online, auth, replication }: ShellProps) {
  const { activeStaff } = useShop()

  return (
    <div class="min-h-svh bg-stone-100 dark:bg-stone-950">
      {/*
        Page-coloured and unbordered, so this and the Screen header below it read
        as one quiet block rather than two stacked bars. Nothing here is a
        surface; the first surface on any screen is its content.
      */}
      <div class="safe-top">
        <div class="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 pt-2.5 pb-1">
          <SyncBadge online={online} auth={auth} replication={replication} />
          {/* One control, not two: the avatar says who is working, the gear says
              what tapping does, and both go to the same place. */}
          <a
            href="/settings"
            aria-label="Settings"
            class="-mr-2 flex min-h-9 items-center gap-2 rounded-control px-2
                   text-stone-500 transition-colors active:bg-stone-200
                   dark:text-stone-400 dark:active:bg-stone-800"
          >
            <IconSettings size={17} />
            {activeStaff && <Avatar name={activeStaff.name} size="sm" />}
          </a>
        </div>
      </div>

      <main>
        <Router>
          <Route path="/" component={Today} />
          <Route path="/clients" component={Clients} />
          <Route path="/clients/:id" component={ClientDetail} />
          <Route path="/orders" component={Orders} />
          <Route path="/orders/new" component={OrderForm} />
          <Route path="/orders/:id" component={OrderDetail} />
          <Route path="/orders/:id/edit" component={OrderForm} />
          <Route path="/reports" component={Reports} />
          <Route path="/settings" component={Settings} />
          <Route path="/settings/shop" component={ShopSettings} />
          <Route path="/settings/measurements" component={MeasurementFieldSettings} />
          <Route path="/settings/staff" component={StaffSettings} />
          <Route path="/settings/backup" component={BackupSettings} />
          <Route default component={NotFound} />
        </Router>
      </main>

      <TabBar />
    </div>
  )
}
