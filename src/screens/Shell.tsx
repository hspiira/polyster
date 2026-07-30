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
import { useShop } from '../state/ShopProvider'
import type { AuthState } from '../lib/auth'
import type { ReplicationStatus } from '../hooks/useReplication'

import { Dashboard } from './Dashboard'
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
  const { activeStaff, shop } = useShop()

  return (
    <div class="min-h-svh bg-stone-100 dark:bg-stone-950">
      <div class="safe-top bg-white dark:bg-stone-900">
        <div class="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-1.5">
          <SyncBadge online={online} auth={auth} replication={replication} />
          {activeStaff && (
            <span class="truncate text-xs text-stone-500 dark:text-stone-400">
              {activeStaff.name}
              {shop && <span class="text-stone-400 dark:text-stone-600"> · {shop.name}</span>}
            </span>
          )}
        </div>
      </div>

      <main>
        <Router>
          <Route path="/" component={Dashboard} />
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
