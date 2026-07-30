/**
 * The authenticated app shell: a scrolling screen area above a fixed tab bar,
 * with the sync badge always in view.
 *
 * ## Routing
 *
 * `preact-iso` with real history URLs rather than hash routing. The usual
 * argument against history routing in a PWA -- a deep link 404s on refresh --
 * does not apply: vite-plugin-pwa's generateSW mode sets
 * `navigateFallback: 'index.html'` by default, so the service worker answers
 * every navigation from the precached shell, including offline. Real paths are
 * worth having for debugging in a browser tab, and they keep the door open to
 * sharing a link to an order later.
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
  const { activeStaff } = useShop()

  return (
    <div class="flex min-h-svh flex-col bg-gray-50">
      <div class="border-b border-gray-200 bg-white">
        <div class="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-2">
          <SyncBadge online={online} auth={auth} replication={replication} />
          {activeStaff && <span class="text-xs text-gray-500">{activeStaff.name}</span>}
        </div>
      </div>

      <main class="flex-1">
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
